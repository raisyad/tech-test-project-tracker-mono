export type ChangeTracker = {
  projects: Map<number, Record<string, unknown>>;
  tasks: Map<number, Record<string, unknown>>;
};

export function createChangeTracker(): ChangeTracker {
  return { projects: new Map(), tasks: new Map() };
}

export function trackProject(tracker: ChangeTracker | undefined, project: { id: number }) {
  tracker?.projects.set(project.id, project);
}

export function trackTask(tracker: ChangeTracker | undefined, task: { id: number }) {
  tracker?.tasks.set(task.id, task);
}

export function collectAffected(
  tracker: ChangeTracker,
  excludeProjectId?: number,
  excludeTaskId?: number,
) {
  return {
    projects: [...tracker.projects.values()].filter((p) => p.id !== excludeProjectId),
    tasks: [...tracker.tasks.values()].filter((t) => t.id !== excludeTaskId),
  };
}
