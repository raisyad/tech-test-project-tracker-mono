import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { recalculateProject } from "@/lib/services/project.service";
import {
  assertDependenciesDone,
  cascadeRevalidateDependents,
  syncTaskDependencies,
} from "@/lib/services/task-dependency.service";
import { DependentEntityExistsError } from "@/lib/errors";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task";
import type { Prisma } from "@/app/generated/prisma/client";

function withDependsOn<T extends { id: bigint; projectId: bigint }>(
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
  if (filters.status) where.status = filters.status;
  if (filters.search) where.name = { contains: filters.search };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { dependsOn: { select: { dependsOnTaskId: true } } },
  });
  return tasks.map((t) => withDependsOn(t, t.dependsOn));
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
    const created = await tx.task.create({
      data: {
        projectId: BigInt(data.projectId),
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

    await recalculateProject(created.projectId, tx);
    return created;
  });
  return serializeTask(task);
}

export async function updateTask(id: bigint, data: UpdateTaskInput) {
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUniqueOrThrow({ where: { id } });

    if (data.dependsOn !== undefined) {
      await syncTaskDependencies(tx, id, data.dependsOn);
    }

    const nextStatus = data.status ?? existing.status;
    if (nextStatus === "done" && existing.status !== "done") {
      await assertDependenciesDone(tx, id);
    }

    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(data.projectId !== undefined && { projectId: BigInt(data.projectId) }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.weight !== undefined && { weight: data.weight }),
      },
    });

    await recalculateProject(updated.projectId, tx);
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
    const dependents = await tx.taskDependency.findMany({
      where: { dependsOnTaskId: id },
      include: { task: { select: { id: true, name: true } } },
    });

    if (dependents.length > 0) {
      throw new DependentEntityExistsError(
        dependents.map((d) => ({ id: Number(d.task.id), name: d.task.name })),
      );
    }

    const existing = await tx.task.findUniqueOrThrow({ where: { id } });
    await tx.task.delete({ where: { id } });
    await recalculateProject(existing.projectId, tx);
  });
}
