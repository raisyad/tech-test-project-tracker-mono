import { CircularDependencyError } from "@/lib/errors";
import type { Prisma } from "@/app/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

async function findDependencyPath(
  tx: TxClient,
  fromId: bigint,
  targetId: bigint,
): Promise<number[] | null> {
  const rows = await tx.$queryRaw<{ path: string }[]>`
    WITH RECURSIVE search AS (
      SELECT depends_on_project_id AS id, CAST(depends_on_project_id AS CHAR(255)) AS path
      FROM project_dependencies WHERE project_id = ${fromId}
      UNION ALL
      SELECT pd.depends_on_project_id, CONCAT(s.path, ',', pd.depends_on_project_id)
      FROM project_dependencies pd
      JOIN search s ON pd.project_id = s.id
    )
    SELECT path FROM search WHERE id = ${targetId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0].path.split(",").map(Number);
}

export async function syncProjectDependencies(
  tx: TxClient,
  projectId: bigint,
  dependsOnIds: number[],
) {
  const current = await tx.projectDependency.findMany({
    where: { projectId },
    select: { dependsOnProjectId: true },
  });
  const currentIds = current.map((c) => Number(c.dependsOnProjectId));
  const nextIds = [...new Set(dependsOnIds)];

  const toRemove = currentIds.filter((id) => !nextIds.includes(id));
  const toAdd = nextIds.filter((id) => !currentIds.includes(id));

  if (toRemove.length > 0) {
    await tx.projectDependency.deleteMany({
      where: { projectId, dependsOnProjectId: { in: toRemove.map(BigInt) } },
    });
  }

  for (const dependsOnId of toAdd) {
    if (dependsOnId === Number(projectId)) {
      throw new CircularDependencyError([Number(projectId)]);
    }

    const dependsOnBigId = BigInt(dependsOnId);
    const path = await findDependencyPath(tx, dependsOnBigId, projectId);
    if (path) {
      throw new CircularDependencyError([Number(projectId), dependsOnId, ...path]);
    }

    await tx.projectDependency.create({
      data: { projectId, dependsOnProjectId: dependsOnBigId },
    });
  }
}
