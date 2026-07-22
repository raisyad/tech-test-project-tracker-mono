import { prisma } from "@/lib/prisma";
import { serializeProject, serializeTask } from "@/lib/serialize";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/validations/project";
import type { Prisma, Status } from "@/app/generated/prisma/client";

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
  });
  return projects.map(serializeProject);
}

export async function getProjectById(id: bigint) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { tasks: true },
  });
  if (!project) return null;
  return {
    ...serializeProject(project),
    tasks: project.tasks.map(serializeTask),
  };
}

export async function createProject(data: CreateProjectInput) {
  const project = await prisma.project.create({
    data: {
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  });
  return serializeProject(project);
}

export async function updateProject(id: bigint, data: UpdateProjectInput) {
  const project = await prisma.project.update({
    where: { id },
    data,
  });
  return serializeProject(project);
}

export async function deleteProject(id: bigint) {
  await prisma.project.delete({ where: { id } });
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
) {
  const tasks = await client.task.findMany({
    where: { projectId: id },
    select: { status: true, weight: true },
  });

  const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + t.weight, 0);
  const completionProgress = totalWeight === 0 ? 0 : (doneWeight / totalWeight) * 100;
  const status = deriveStatus(tasks.map((t) => t.status));

  await client.project.update({
    where: { id },
    data: { status, completionProgress },
  });
}
