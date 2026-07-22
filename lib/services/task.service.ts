import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import {
  assertDependenciesDone,
  cascadeRevalidateDependents,
  syncTaskDependencies,
} from "@/lib/services/task-dependency.service";
import {
  applyTreeVisibility,
  assertSameProjectAsParent,
  getDescendantIds,
  recalculateTaskChain,
} from "@/lib/services/task-hierarchy.service";
import { recalculateProject } from "@/lib/services/project.service";
import {
  DependentEntityExistsError,
  InvalidParentTaskError,
  ReadonlyFieldError,
} from "@/lib/errors";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task";
import type { Prisma } from "@/app/generated/prisma/client";

function withDependsOn<T extends { id: bigint; projectId: bigint; parentTaskId: bigint | null }>(
  task: T,
  dependencies: { dependsOnTaskId: bigint }[],
) {
  return {
    ...serializeTask(task),
    dependsOn: dependencies.map((d) => Number(d.dependsOnTaskId)),
  };
}

export async function listTasks(filters: {
  projectId?: number;
  status?: "draft" | "in_progress" | "done";
  search?: string;
}) {
  const where: Prisma.TaskWhereInput = {};
  if (filters.projectId) where.projectId = BigInt(filters.projectId);

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { dependsOn: { select: { dependsOnTaskId: true } } },
  });
  const serialized = tasks.map((t) => withDependsOn(t, t.dependsOn));

  return applyTreeVisibility(serialized, {
    status: filters.status,
    search: filters.search,
  });
}

export async function getTaskById(id: bigint) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { dependsOn: { select: { dependsOnTaskId: true } } },
  });
  if (!task) return null;
  return withDependsOn(task, task.dependsOn);
}

export async function createTask(data: CreateTaskInput) {
  const task = await prisma.$transaction(async (tx) => {
    const projectId = BigInt(data.projectId);
    const parentTaskId = data.parentTaskId != null ? BigInt(data.parentTaskId) : null;

    if (parentTaskId !== null) {
      await assertSameProjectAsParent(tx, projectId, parentTaskId);
    }

    const created = await tx.task.create({
      data: {
        projectId,
        parentTaskId,
        name: data.name,
        status: data.status,
        weight: data.weight,
      },
    });

    if (data.dependsOn && data.dependsOn.length > 0) {
      await syncTaskDependencies(tx, created.id, data.dependsOn);
    }

    if (data.status === "done") {
      await assertDependenciesDone(tx, created.id);
    }

    await recalculateTaskChain(tx, created.id);
    return created;
  });
  return serializeTask(task);
}

export async function updateTask(id: bigint, data: UpdateTaskInput) {
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUniqueOrThrow({ where: { id } });

    const childrenCount = await tx.task.count({ where: { parentTaskId: id } });
    if (childrenCount > 0 && data.status !== undefined) {
      throw new ReadonlyFieldError("status");
    }

    if (data.dependsOn !== undefined) {
      await syncTaskDependencies(tx, id, data.dependsOn);
    }

    const nextStatus = data.status ?? existing.status;
    if (nextStatus === "done" && existing.status !== "done") {
      await assertDependenciesDone(tx, id);
    }

    let nextParentTaskId = existing.parentTaskId;
    if (data.parentTaskId !== undefined) {
      nextParentTaskId = data.parentTaskId === null ? null : BigInt(data.parentTaskId);

      if (nextParentTaskId !== null) {
        if (nextParentTaskId === id) {
          throw new InvalidParentTaskError("Task tidak bisa menjadi parent dari dirinya sendiri");
        }
        const descendantIds = await getDescendantIds(tx, id);
        if (descendantIds.some((d) => d === nextParentTaskId)) {
          throw new InvalidParentTaskError(
            "Task tidak bisa dipindah ke bawah descendant-nya sendiri",
          );
        }
        const nextProjectId =
          data.projectId !== undefined ? BigInt(data.projectId) : existing.projectId;
        await assertSameProjectAsParent(tx, nextProjectId, nextParentTaskId);
      }
    }

    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(data.projectId !== undefined && { projectId: BigInt(data.projectId) }),
        ...(data.parentTaskId !== undefined && { parentTaskId: nextParentTaskId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.weight !== undefined && { weight: data.weight }),
      },
    });

    await recalculateTaskChain(tx, updated.id);
    if (existing.parentTaskId !== null && existing.parentTaskId !== updated.parentTaskId) {
      await recalculateTaskChain(tx, existing.parentTaskId);
    }
    if (existing.projectId !== updated.projectId) {
      await recalculateProject(existing.projectId, tx);
    }

    if (data.status !== undefined && data.status !== existing.status) {
      await cascadeRevalidateDependents(tx, id);
    }

    return updated;
  });
  return serializeTask(task);
}

export async function deleteTask(id: bigint) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUniqueOrThrow({ where: { id } });
    const descendantIds = await getDescendantIds(tx, id);
    const subtreeIds = [id, ...descendantIds];

    const dependents = await tx.taskDependency.findMany({
      where: {
        dependsOnTaskId: { in: subtreeIds },
        taskId: { notIn: subtreeIds },
      },
      include: { task: { select: { id: true, name: true } } },
    });

    if (dependents.length > 0) {
      throw new DependentEntityExistsError(
        dependents.map((d) => ({ id: Number(d.task.id), name: d.task.name })),
      );
    }

    await tx.task.delete({ where: { id } });

    if (existing.parentTaskId !== null) {
      await recalculateTaskChain(tx, existing.parentTaskId);
    } else {
      await recalculateProject(existing.projectId, tx);
    }
  });
}
