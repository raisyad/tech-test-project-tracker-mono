import { afterEach, describe, expect, it } from "vitest";
import { createProject, getProjectById } from "@/lib/services/project.service";
import { createTask, updateTask } from "@/lib/services/task.service";
import { applyTreeVisibility } from "@/lib/services/task-hierarchy.service";
import { InvalidParentTaskError } from "@/lib/errors";
import { cleanupTestData, uniqueDateRange, uniqueName } from "@/lib/services/__tests__/test-helpers";

describe("subtask hierarchy and filtering", () => {
  let projectIds: bigint[] = [];
  let taskIds: bigint[] = [];

  afterEach(async () => {
    await cleanupTestData(projectIds, taskIds);
    projectIds = [];
    taskIds = [];
  });

  async function makeProject() {
    const { project } = await createProject({
      name: uniqueName("hierarchy-test"),
      ...uniqueDateRange(),
    });
    projectIds.push(BigInt(project.id));
    return project;
  }

  it("only counts leaf task weight toward project progress, ignoring the parent's own weight", async () => {
    const project = await makeProject();
    const { task: parent } = await createTask({
      projectId: project.id,
      name: uniqueName("parent"),
      weight: 99,
      status: "draft",
    });
    const { task: child } = await createTask({
      projectId: project.id,
      parentTaskId: parent.id,
      name: uniqueName("child"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(parent.id), BigInt(child.id));

    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.completionProgress).toBe(100);
  });

  it("derives a non-leaf task's status from its direct children", async () => {
    const project = await makeProject();
    const { task: parent } = await createTask({
      projectId: project.id,
      name: uniqueName("parent"),
      weight: 1,
      status: "draft",
    });
    const { task: child1 } = await createTask({
      projectId: project.id,
      parentTaskId: parent.id,
      name: uniqueName("child1"),
      weight: 1,
      status: "done",
    });
    const { task: child2 } = await createTask({
      projectId: project.id,
      parentTaskId: parent.id,
      name: uniqueName("child2"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(parent.id), BigInt(child1.id), BigInt(child2.id));

    const { affected } = await updateTask(BigInt(child2.id), { status: "done" });
    const parentAffected = affected.tasks.find((t) => t.id === parent.id);
    expect(parentAffected?.status).toBe("done");
  });

  it("propagates status changes up a multi-level chain to the project", async () => {
    const project = await makeProject();
    const { task: grandparent } = await createTask({
      projectId: project.id,
      name: uniqueName("gp"),
      weight: 1,
      status: "draft",
    });
    const { task: parent } = await createTask({
      projectId: project.id,
      parentTaskId: grandparent.id,
      name: uniqueName("p"),
      weight: 1,
      status: "draft",
    });
    const { task: child } = await createTask({
      projectId: project.id,
      parentTaskId: parent.id,
      name: uniqueName("c"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(grandparent.id), BigInt(parent.id), BigInt(child.id));

    const { affected } = await updateTask(BigInt(child.id), { status: "done" });
    expect(affected.tasks.find((t) => t.id === parent.id)?.status).toBe("done");
    expect(affected.tasks.find((t) => t.id === grandparent.id)?.status).toBe("done");
    expect(affected.projects.find((p) => p.id === project.id)?.status).toBe("done");
  });

  it("rejects a subtask parented to a task in a different project", async () => {
    const projectA = await makeProject();
    const projectB = await makeProject();
    const { task: parent } = await createTask({
      projectId: projectA.id,
      name: uniqueName("parent"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(parent.id));

    await expect(
      createTask({
        projectId: projectB.id,
        parentTaskId: parent.id,
        name: uniqueName("child"),
        weight: 1,
        status: "draft",
      }),
    ).rejects.toThrow(InvalidParentTaskError);
  });

  it("rejects moving a task to become a child of its own descendant", async () => {
    const project = await makeProject();
    const { task: parent } = await createTask({
      projectId: project.id,
      name: uniqueName("parent"),
      weight: 1,
      status: "draft",
    });
    const { task: child } = await createTask({
      projectId: project.id,
      parentTaskId: parent.id,
      name: uniqueName("child"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(parent.id), BigInt(child.id));

    await expect(
      updateTask(BigInt(parent.id), { parentTaskId: child.id }),
    ).rejects.toThrow(InvalidParentTaskError);
  });

  describe("applyTreeVisibility", () => {
    type T = { id: number; parentTaskId: number | null; name: string; status: string };

    it("shows an ancestor dimmed when only its descendant matches the filter", () => {
      const tasks: T[] = [
        { id: 1, parentTaskId: null, name: "Parent", status: "draft" },
        { id: 2, parentTaskId: 1, name: "Special Child", status: "draft" },
      ];
      const result = applyTreeVisibility(tasks, { search: "special" });
      expect(result.map((t) => t.id).sort()).toEqual([1, 2]);
      expect(result.find((t) => t.id === 1)?.dimmed).toBe(true);
      expect(result.find((t) => t.id === 2)?.dimmed).toBe(false);
    });

    it("excludes a subtree entirely when nothing in it matches", () => {
      const tasks: T[] = [
        { id: 1, parentTaskId: null, name: "Match Me", status: "draft" },
        { id: 2, parentTaskId: null, name: "No Match", status: "draft" },
        { id: 3, parentTaskId: 2, name: "Also No Match", status: "draft" },
      ];
      const result = applyTreeVisibility(tasks, { search: "match me" });
      expect(result.map((t) => t.id)).toEqual([1]);
    });

    it("applies status and search filters together with AND semantics", () => {
      const tasks: T[] = [
        { id: 1, parentTaskId: null, name: "Alpha", status: "done" },
        { id: 2, parentTaskId: null, name: "Alpha", status: "draft" },
      ];
      const result = applyTreeVisibility(tasks, { status: "done", search: "alpha" });
      expect(result.map((t) => t.id)).toEqual([1]);
    });
  });
});
