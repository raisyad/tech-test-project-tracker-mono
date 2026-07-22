import { recalculateTaskChain } from "@/lib/services/task-hierarchy.service";
import { serializeTask } from "@/lib/serialize";
import { type ChangeTracker, trackTask } from "@/lib/change-tracker";
import { CircularDependencyError, DependencyNotDoneError } from "@/lib/errors";
import type { Prisma } from "@/app/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

async function findDependencyPath(
  tx: TxClient,
  fromId: bigint,
  targetId: bigint,
): Promise<number[] | null> {
  const rows = await tx.$queryRaw<{ path: string }[]>`
    WITH RECURSIVE search AS (
      SELECT depends_on_task_id AS id, CAST(depends_on_task_id AS CHAR(255)) AS path
      FROM task_dependencies WHERE task_id = ${fromId}
      UNION ALL
      SELECT td.depends_on_task_id, CONCAT(s.path, ',', td.depends_on_task_id)
      FROM task_dependencies td
      JOIN search s ON td.task_id = s.id
    )
    SELECT path FROM search WHERE id = ${targetId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0].path.split(",").map(Number);
}

export async function syncTaskDependencies(
  tx: TxClient,
  taskId: bigint,
  dependsOnIds: number[],
) {
  const current = await tx.taskDependency.findMany({
    where: { taskId },
    select: { dependsOnTaskId: true },
  });
  const currentIds = current.map((c) => Number(c.dependsOnTaskId));
  const nextIds = [...new Set(dependsOnIds)];

  const toRemove = currentIds.filter((id) => !nextIds.includes(id));
  const toAdd = nextIds.filter((id) => !currentIds.includes(id));

  if (toRemove.length > 0) {
    await tx.taskDependency.deleteMany({
      where: { taskId, dependsOnTaskId: { in: toRemove.map(BigInt) } },
    });
  }

  for (const dependsOnId of toAdd) {
    if (dependsOnId === Number(taskId)) {
      throw new CircularDependencyError([Number(taskId)]);
    }

    const dependsOnBigId = BigInt(dependsOnId);
    const path = await findDependencyPath(tx, dependsOnBigId, taskId);
    if (path) {
      throw new CircularDependencyError([Number(taskId), dependsOnId, ...path]);
    }

    await tx.taskDependency.create({
      data: { taskId, dependsOnTaskId: dependsOnBigId },
    });
  }
}

export async function assertDependenciesDone(tx: TxClient, taskId: bigint) {
  const deps = await tx.taskDependency.findMany({
    where: { taskId },
    include: { dependsOnTask: { select: { id: true, name: true, status: true } } },
  });

  const blocking = deps
    .filter((d) => d.dependsOnTask.status !== "done")
    .map((d) => ({
      id: Number(d.dependsOnTask.id),
      name: d.dependsOnTask.name,
      status: d.dependsOnTask.status,
    }));

  if (blocking.length > 0) {
    throw new DependencyNotDoneError(blocking);
  }
}

export async function cascadeRevalidateDependents(
  tx: TxClient,
  taskId: bigint,
  visited: Set<string> = new Set(),
  tracker?: ChangeTracker,
) {
  const key = taskId.toString();
  if (visited.has(key)) return;
  visited.add(key);

  const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "done") return;

  const dependents = await tx.taskDependency.findMany({
    where: { dependsOnTaskId: taskId },
    include: { task: true },
  });

  for (const dependent of dependents) {
    if (dependent.task.status !== "done") continue;

    const updated = await tx.task.update({
      where: { id: dependent.task.id },
      data: { status: "in_progress" },
    });
    trackTask(tracker, serializeTask(updated));
    await recalculateTaskChain(tx, dependent.task.id, tracker);
    await cascadeRevalidateDependents(tx, dependent.task.id, visited, tracker);
  }
}
