import { prisma } from "@/lib/prisma";

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let dateRangeCounter = 0;

export function uniqueDateRange(): { startDate: Date; endDate: Date } {
  dateRangeCounter += 1;
  const baseYear = 2040 + dateRangeCounter;
  return {
    startDate: new Date(`${baseYear}-01-01`),
    endDate: new Date(`${baseYear}-01-10`),
  };
}

export async function cleanupTestData(projectIds: bigint[], taskIds: bigint[]) {
  if (taskIds.length > 0) {
    await prisma.taskDependency.deleteMany({
      where: { OR: [{ taskId: { in: taskIds } }, { dependsOnTaskId: { in: taskIds } }] },
    });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }
  if (projectIds.length > 0) {
    await prisma.projectDependency.deleteMany({
      where: {
        OR: [{ projectId: { in: projectIds } }, { dependsOnProjectId: { in: projectIds } }],
      },
    });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  }
}
