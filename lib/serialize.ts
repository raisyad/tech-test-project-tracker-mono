export function serializeProject<
  T extends { id: bigint; completionProgress: unknown },
>(project: T) {
  return {
    ...project,
    id: Number(project.id),
    completionProgress: Number(project.completionProgress),
  };
}

export function serializeTask<
  T extends { id: bigint; projectId: bigint; parentTaskId: bigint | null },
>(task: T) {
  return {
    ...task,
    id: Number(task.id),
    projectId: Number(task.projectId),
    parentTaskId: task.parentTaskId === null ? null : Number(task.parentTaskId),
  };
}
