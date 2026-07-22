import { ScheduleOverlapError } from "@/lib/errors";
import type { Prisma } from "@/app/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

export async function lockScheduleAndCheckOverlap(
  tx: TxClient,
  params: { excludeProjectId?: bigint; startDate: Date; endDate: Date },
) {
  await tx.$queryRaw`SELECT id FROM schedule_locks WHERE id = 1 FOR UPDATE`;

  const conflicting = await tx.project.findFirst({
    where: {
      ...(params.excludeProjectId !== undefined && {
        id: { not: params.excludeProjectId },
      }),
      startDate: { lte: params.endDate },
      endDate: { gte: params.startDate },
    },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  if (conflicting) {
    throw new ScheduleOverlapError({
      id: Number(conflicting.id),
      name: conflicting.name,
      startDate: conflicting.startDate.toISOString(),
      endDate: conflicting.endDate.toISOString(),
    });
  }
}
