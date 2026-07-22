import { deriveStatus, recalculateProject } from "@/lib/services/project.service";
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

export async function recalculateTaskChain(tx: TxClient, taskId: bigint) {
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
        await tx.task.update({
          where: { id: current.id },
          data: { status: computedStatus },
        });
      }
    }

    currentId = current.parentTaskId;
  }

  await recalculateProject(startTask.projectId, tx);
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

type FilterableTask = {
  id: number;
  parentTaskId: number | null;
  name: string;
  status: string;
};

export function applyTreeVisibility<T extends FilterableTask>(
  tasks: T[],
  filters: { status?: string; search?: string },
): (T & { dimmed: boolean })[] {
  const byParent = new Map<number | null, T[]>();
  for (const task of tasks) {
    const key = task.parentTaskId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(task);
  }

  function matches(task: T): boolean {
    const statusMatches = !filters.status || task.status === filters.status;
    const searchMatches =
      !filters.search || task.name.toLowerCase().includes(filters.search.toLowerCase());
    return statusMatches && searchMatches;
  }

  function visit(task: T): { visible: boolean; nodes: (T & { dimmed: boolean })[] } {
    const children = byParent.get(task.id) ?? [];
    const childVisits = children.map(visit);
    const anyChildVisible = childVisits.some((c) => c.visible);

    const isMatch = matches(task);
    const isVisible = isMatch || anyChildVisible;

    const nodes: (T & { dimmed: boolean })[] = [];
    if (isVisible) {
      nodes.push({ ...task, dimmed: !isMatch });
      for (const childVisit of childVisits) {
        nodes.push(...childVisit.nodes);
      }
    }

    return { visible: isVisible, nodes };
  }

  const result: (T & { dimmed: boolean })[] = [];
  const roots = byParent.get(null) ?? [];
  for (const root of roots) {
    result.push(...visit(root).nodes);
  }

  return result;
}
