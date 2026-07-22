export function serializeProject<
  T extends { id: bigint; completionProgress: unknown },
>(project: T) {
  return {
    ...project,
    id: Number(project.id),
    completionProgress: Number(project.completionProgress),
  };
}

export function serializeTask<T extends { id: bigint; projectId: bigint }>(
  task: T,
) {
  return {
    ...task,
    id: Number(task.id),
    projectId: Number(task.projectId),
  };
}
