import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { recalculateProject } from "@/lib/services/project.service";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task";
import type { Prisma } from "@/app/generated/prisma/client";

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
  });
  return tasks.map(serializeTask);
}

export async function getTaskById(id: bigint) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return null;
  return serializeTask(task);
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
    await recalculateProject(created.projectId, tx);
    return created;
  });
  return serializeTask(task);
}

export async function updateTask(id: bigint, data: UpdateTaskInput) {
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUniqueOrThrow({ where: { id } });

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

    return updated;
  });
  return serializeTask(task);
}

export async function deleteTask(id: bigint) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUniqueOrThrow({ where: { id } });
    await tx.task.delete({ where: { id } });
    await recalculateProject(existing.projectId, tx);
  });
}
