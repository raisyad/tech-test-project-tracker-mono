import { afterEach, describe, expect, it } from "vitest";
import { createProject, deleteProject, getProjectById, updateProject } from "@/lib/services/project.service";
import { createTask, updateTask } from "@/lib/services/task.service";
import { CircularDependencyError, DependentEntityExistsError } from "@/lib/errors";
import { cleanupTestData, uniqueDateRange, uniqueName } from "@/lib/services/__tests__/test-helpers";

describe("project dependency gating, cycle prevention, cascade", () => {
  let projectIds: bigint[] = [];
  let taskIds: bigint[] = [];

  afterEach(async () => {
    await cleanupTestData(projectIds, taskIds);
    projectIds = [];
    taskIds = [];
  });

  async function makeProject(dependsOn?: number[]) {
    const { project } = await createProject({
      name: uniqueName("proj-dep"),
      ...uniqueDateRange(),
      dependsOn,
    });
    projectIds.push(BigInt(project.id));
    return project;
  }

  it("gates status to draft when dependency project is not done, even if own tasks are done", async () => {
    const a = await makeProject();
    const b = await makeProject([a.id]);
    const { task } = await createTask({
      projectId: b.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(task.id));

    const detail = await getProjectById(BigInt(b.id));
    expect(detail?.status).toBe("draft");
    expect(detail?.completionProgress).toBe(100);
  });

  it("cascades to done when the dependency project becomes done", async () => {
    const a = await makeProject();
    const b = await makeProject([a.id]);
    const { task: taskB } = await createTask({
      projectId: b.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(taskB.id));

    const { task: taskA } = await createTask({
      projectId: a.id,
      name: uniqueName("task"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(taskA.id));

    let detail = await getProjectById(BigInt(b.id));
    expect(detail?.status).toBe("draft");

    const { affected } = await updateTask(BigInt(taskA.id), { status: "done" });
    expect(affected.projects.some((p) => p.id === b.id && p.status === "done")).toBe(true);

    detail = await getProjectById(BigInt(b.id));
    expect(detail?.status).toBe("done");
  });

  it("rejects a direct self-dependency", async () => {
    const a = await makeProject();
    await expect(updateProject(BigInt(a.id), { dependsOn: [a.id] })).rejects.toThrow(
      CircularDependencyError,
    );
  });

  it("rejects a transitive circular dependency", async () => {
    const a = await makeProject();
    const b = await makeProject([a.id]);

    await expect(updateProject(BigInt(a.id), { dependsOn: [b.id] })).rejects.toThrow(
      CircularDependencyError,
    );
  });

  it("accepts multiple new edges added in one request when none of them cycle", async () => {
    const a = await makeProject();
    const b = await makeProject([a.id]);
    const c = await makeProject();

    const { project: updated } = await updateProject(BigInt(c.id), {
      dependsOn: [a.id, b.id],
    });
    expect(updated.dependsOn.sort()).toEqual([a.id, b.id].sort());
  });

  it("rejects the whole request atomically when only one of several new edges in the same PATCH would cycle", async () => {
    const a = await makeProject();
    const harmless = await makeProject();
    const b = await makeProject([a.id]);

    await expect(
      updateProject(BigInt(a.id), { dependsOn: [harmless.id, b.id] }),
    ).rejects.toThrow(CircularDependencyError);

    const untouched = await getProjectById(BigInt(a.id));
    expect(untouched?.dependsOn).toEqual([]);
  });

  it("rejects deleting a project still depended on by another project", async () => {
    const a = await makeProject();
    await makeProject([a.id]);

    await expect(deleteProject(BigInt(a.id))).rejects.toThrow(DependentEntityExistsError);
  });

  it("rejects deleting a project whose task is depended on by a task in another project, with actionable payload", async () => {
    const a = await makeProject();
    const b = await makeProject();

    const { task: taskA } = await createTask({
      projectId: a.id,
      name: uniqueName("A-task"),
      weight: 1,
      status: "draft",
    });
    const { task: taskB } = await createTask({
      projectId: b.id,
      name: uniqueName("B-task"),
      weight: 1,
      status: "draft",
      dependsOn: [taskA.id],
    });
    taskIds.push(BigInt(taskA.id), BigInt(taskB.id));

    await expect(deleteProject(BigInt(a.id))).rejects.toThrow(DependentEntityExistsError);

    try {
      await deleteProject(BigInt(a.id));
      throw new Error("expected deleteProject to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DependentEntityExistsError);
      const dependent = (err as InstanceType<typeof DependentEntityExistsError>).dependents[0];
      expect(dependent.id).toBe(taskB.id);
      expect(dependent.name).toBe(taskB.name);
      expect(dependent.projectId).toBe(b.id);
      expect(dependent.projectName).toBe(b.name);
      expect(dependent.blockedTaskId).toBe(taskA.id);
      expect(dependent.blockedTaskName).toBe(taskA.name);
    }
  });

  it("does not gate completionProgress, only status", async () => {
    const a = await makeProject();
    const b = await makeProject([a.id]);
    const { task } = await createTask({
      projectId: b.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(task.id));

    const detail = await getProjectById(BigInt(b.id));
    expect(detail?.status).toBe("draft");
    expect(detail?.completionProgress).toBe(100);
  });
});
