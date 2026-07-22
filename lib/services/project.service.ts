import { prisma } from "@/lib/prisma";
import { serializeProject, serializeTask } from "@/lib/serialize";
import { syncProjectDependencies } from "@/lib/services/project-dependency.service";
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

export async function listProjects(filters: {
  status?: "draft" | "in_progress" | "done";
  search?: string;
}) {
  const where: Prisma.ProjectWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) where.name = { contains: filters.search };

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
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });

    if (data.dependsOn && data.dependsOn.length > 0) {
      await syncProjectDependencies(tx, created.id, data.dependsOn);
      await recalculateProject(created.id, tx);
    }

    return created;
  });
  return serializeProject(project);
}

export async function updateProject(id: bigint, data: UpdateProjectInput) {
  const project = await prisma.$transaction(async (tx) => {
    const { dependsOn, ...rest } = data;

    if (dependsOn !== undefined) {
      await syncProjectDependencies(tx, id, dependsOn);
    }

    const updated = await tx.project.update({
      where: { id },
      data: rest,
    });

    if (dependsOn !== undefined) {
      await recalculateProject(id, tx);
    }

    return updated;
  });
  return serializeProject(project);
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

function deriveStatus(statuses: Status[]): Status {
  if (statuses.length === 0) return "draft";
  if (statuses.every((s) => s === "draft")) return "draft";
  if (statuses.every((s) => s === "done")) return "done";
  return "in_progress";
}

export async function recalculateProject(
  id: bigint,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  visited: Set<string> = new Set(),
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
    select: { status: true, weight: true },
  });

  const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + t.weight, 0);
  const completionProgress = totalWeight === 0 ? 0 : (doneWeight / totalWeight) * 100;
  const baseStatus = deriveStatus(tasks.map((t) => t.status));

  const dependencies = await client.projectDependency.findMany({
    where: { projectId: id },
    include: { dependsOnProject: { select: { status: true } } },
  });
  const allDependenciesDone = dependencies.every(
    (d) => d.dependsOnProject.status === "done",
  );
  const finalStatus = allDependenciesDone ? baseStatus : "draft";

  await client.project.update({
    where: { id },
    data: { status: finalStatus, completionProgress },
  });

  if (finalStatus !== before.status) {
    const dependents = await client.projectDependency.findMany({
      where: { dependsOnProjectId: id },
      select: { projectId: true },
    });
    for (const dependent of dependents) {
      await recalculateProject(dependent.projectId, client, visited);
    }
  }
}
