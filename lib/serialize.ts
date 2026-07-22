// Prisma mengembalikan BigInt (id) dan Decimal (completion_progress), keduanya
// tidak bisa langsung di-JSON.stringify oleh Next.js Route Handler.
export function serializeProject<
  T extends { id: bigint; completionProgress: unknown },
>(project: T) {
  return {
    ...project,
    id: Number(project.id),
    completionProgress: Number(project.completionProgress),
  };
}
