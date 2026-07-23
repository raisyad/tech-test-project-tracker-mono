import { deriveStatus, recalculateProject } from "@/lib/services/project.service";
import { serializeTask } from "@/lib/serialize";
import { type ChangeTracker, trackTask } from "@/lib/change-tracker";
import { InvalidParentTaskError } from "@/lib/errors";
import type { Prisma, Status } from "@/app/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

type TaskNode = {
  id: bigint;
  status: Status;
  parentTaskId: bigint | null;
};

async function fetchTaskNode(tx: TxClient, id: bigint): Promise<TaskNode> {
  return tx.task.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true, parentTaskId: true },
  });
}

export async function recalculateTaskChain(
  tx: TxClient,
  taskId: bigint,
  tracker?: ChangeTracker,
) {
  const startTask = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true },
  });

  let currentId: bigint | null = taskId;
  while (currentId !== null) {
    const current: TaskNode = await fetchTaskNode(tx, currentId);

    const children = await tx.task.findMany({
      where: { parentTaskId: current.id },
      select: { status: true },
    });

    if (children.length > 0) {
      const computedStatus = deriveStatus(children.map((c) => c.status));
      if (computedStatus !== current.status) {
        const updated = await tx.task.update({
          where: { id: current.id },
          data: { status: computedStatus },
        });
        trackTask(tracker, serializeTask(updated));
      }
    }

    currentId = current.parentTaskId;
  }

  await recalculateProject(startTask.projectId, tx, new Set(), tracker);
}

export async function getDescendantIds(
  tx: TxClient,
  taskId: bigint,
): Promise<bigint[]> {
  const rows = await tx.$queryRaw<{ id: bigint }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM tasks WHERE parent_task_id = ${taskId}
      UNION ALL
      SELECT t.id FROM tasks t JOIN descendants d ON t.parent_task_id = d.id
    )
    SELECT id FROM descendants
  `;
  return rows.map((r) => r.id);
}

export async function assertSameProjectAsParent(
  tx: TxClient,
  projectId: bigint,
  parentTaskId: bigint,
) {
  const parent = await tx.task.findUniqueOrThrow({
    where: { id: parentTaskId },
    select: { projectId: true },
  });
  if (parent.projectId !== projectId) {
    throw new InvalidParentTaskError(
      "Subtask harus berada di project yang sama dengan parent task-nya",
    );
  }
}

export { applyTreeVisibility } from "@/lib/task-tree";
