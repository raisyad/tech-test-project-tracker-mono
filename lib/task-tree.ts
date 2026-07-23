export type FilterableTask = {
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
