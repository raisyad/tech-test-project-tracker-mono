import { prisma } from "@/lib/prisma";
import { serializeProject, serializeTask } from "@/lib/serialize";
import { syncProjectDependencies } from "@/lib/services/project-dependency.service";
import { lockScheduleAndCheckOverlap } from "@/lib/services/schedule.service";
import {
  type ChangeTracker,
  collectAffected,
  createChangeTracker,
  trackProject,
} from "@/lib/change-tracker";
import { DependentEntityExistsError } from "@/lib/errors";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/validations/project";
import type { Prisma, Status } from "@/app/generated/prisma/client";

function withDependsOn<T extends { id: bigint; completionProgress: unknown }>(
  project: T,
  dependencies: { dependsOnProjectId: bigint }[],
) {
  return {
    ...serializeProject(project),
    dependsOn: dependencies.map((d) => Number(d.dependsOnProjectId)),
  };
}

export async function attachProjectDependsOn(ids: number[]): Promise<Map<number, number[]>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.projectDependency.findMany({
    where: { projectId: { in: ids.map(BigInt) } },
    select: { projectId: true, dependsOnProjectId: true },
  });
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const key = Number(row.projectId);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(Number(row.dependsOnProjectId));
  }
  return map;
}

export async function listProjects(filters: {
  status?: "draft" | "in_progress" | "done";
  search?: string;
  dependsOnId?: number;
}) {
  const where: Prisma.ProjectWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) where.name = { contains: filters.search };
  if (filters.dependsOnId) {
    where.dependsOn = { some: { dependsOnProjectId: BigInt(filters.dependsOnId) } };
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { dependsOn: { select: { dependsOnProjectId: true } } },
  });
  return projects.map((p) => withDependsOn(p, p.dependsOn));
}

export async function getProjectById(id: bigint) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: true,
      dependsOn: { select: { dependsOnProjectId: true } },
    },
  });
  if (!project) return null;
  return {
    ...withDependsOn(project, project.dependsOn),
    tasks: project.tasks.map(serializeTask),
  };
}

export async function createProject(data: CreateProjectInput) {
  const tracker: ChangeTracker = createChangeTracker();

  const project = await prisma.$transaction(async (tx) => {
    await lockScheduleAndCheckOverlap(tx, {
      startDate: data.startDate,
      endDate: data.endDate,
    });

    const created = await tx.project.create({
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });

    if (data.dependsOn && data.dependsOn.length > 0) {
      await syncProjectDependencies(tx, created.id, data.dependsOn);
      await recalculateProject(created.id, tx, new Set(), tracker);
    }

    return created;
  });

  const serialized = serializeProject(project);
  const { projects: affectedProjects, tasks: affectedTasks } = collectAffected(
    tracker,
    serialized.id,
  );
  const depsMap = await attachProjectDependsOn([
    serialized.id,
    ...affectedProjects.map((p) => p.id),
  ]);
  return {
    project: { ...serialized, dependsOn: depsMap.get(serialized.id) ?? [] },
    affected: {
      projects: affectedProjects.map((p) => ({ ...p, dependsOn: depsMap.get(p.id) ?? [] })),
      tasks: affectedTasks,
    },
  };
}

export async function updateProject(id: bigint, data: UpdateProjectInput) {
  const tracker: ChangeTracker = createChangeTracker();

  const project = await prisma.$transaction(async (tx) => {
    const { dependsOn, ...rest } = data;

    if (data.startDate !== undefined || data.endDate !== undefined) {
      const existing = await tx.project.findUniqueOrThrow({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      await lockScheduleAndCheckOverlap(tx, {
        excludeProjectId: id,
        startDate: data.startDate ?? existing.startDate,
        endDate: data.endDate ?? existing.endDate,
      });
    }

    if (dependsOn !== undefined) {
      await syncProjectDependencies(tx, id, dependsOn);
    }

    const updated = await tx.project.update({
      where: { id },
      data: rest,
    });

    if (dependsOn !== undefined) {
      await recalculateProject(id, tx, new Set(), tracker);
    }

    return updated;
  });

  const serialized = serializeProject(project);
  const { projects: affectedProjects, tasks: affectedTasks } = collectAffected(
    tracker,
    serialized.id,
  );
  const depsMap = await attachProjectDependsOn([
    serialized.id,
    ...affectedProjects.map((p) => p.id),
  ]);
  return {
    project: { ...serialized, dependsOn: depsMap.get(serialized.id) ?? [] },
    affected: {
      projects: affectedProjects.map((p) => ({ ...p, dependsOn: depsMap.get(p.id) ?? [] })),
      tasks: affectedTasks,
    },
  };
}

export async function deleteProject(id: bigint) {
  await prisma.$transaction(async (tx) => {
    const dependentProjects = await tx.projectDependency.findMany({
      where: { dependsOnProjectId: id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (dependentProjects.length > 0) {
      throw new DependentEntityExistsError(
        dependentProjects.map((d) => ({ id: Number(d.project.id), name: d.project.name })),
      );
    }

    const taskIds = (
      await tx.task.findMany({ where: { projectId: id }, select: { id: true } })
    ).map((t) => t.id);

    if (taskIds.length > 0) {
      const externalDependents = await tx.taskDependency.findMany({
        where: {
          dependsOnTaskId: { in: taskIds },
          task: { projectId: { not: id } },
        },
        include: { task: { select: { id: true, name: true } } },
      });
      if (externalDependents.length > 0) {
        throw new DependentEntityExistsError(
          externalDependents.map((d) => ({ id: Number(d.task.id), name: d.task.name })),
        );
      }
    }

    await tx.project.delete({ where: { id } });
  });
}

export function deriveStatus(statuses: Status[]): Status {
  if (statuses.length === 0) return "draft";
  if (statuses.every((s) => s === "draft")) return "draft";
  if (statuses.every((s) => s === "done")) return "done";
  return "in_progress";
}

export async function recalculateProject(
  id: bigint,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  visited: Set<string> = new Set(),
  tracker?: ChangeTracker,
) {
  const key = id.toString();
  if (visited.has(key)) return;
  visited.add(key);

  const before = await client.project.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });

  const tasks = await client.task.findMany({
    where: { projectId: id },
    select: { id: true, parentTaskId: true, status: true, weight: true },
  });

  const parentIds = new Set(
    tasks.filter((t) => t.parentTaskId !== null).map((t) => t.parentTaskId!.toString()),
  );
  const leafTasks = tasks.filter((t) => !parentIds.has(t.id.toString()));
  const topLevelTasks = tasks.filter((t) => t.parentTaskId === null);

  const totalWeight = leafTasks.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = leafTasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + t.weight, 0);
  const completionProgress = totalWeight === 0 ? 0 : (doneWeight / totalWeight) * 100;
  const baseStatus = deriveStatus(topLevelTasks.map((t) => t.status));

  const dependencies = await client.projectDependency.findMany({
    where: { projectId: id },
    include: { dependsOnProject: { select: { status: true } } },
  });
  const allDependenciesDone = dependencies.every(
    (d) => d.dependsOnProject.status === "done",
  );
  const finalStatus = allDependenciesDone ? baseStatus : "draft";

  const updated = await client.project.update({
    where: { id },
    data: { status: finalStatus, completionProgress },
  });
  trackProject(tracker, serializeProject(updated));

  if (finalStatus !== before.status) {
    const dependents = await client.projectDependency.findMany({
      where: { dependsOnProjectId: id },
      select: { projectId: true },
    });
    for (const dependent of dependents) {
      await recalculateProject(dependent.projectId, client, visited, tracker);
    }
  }
}
