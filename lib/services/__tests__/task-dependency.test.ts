import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/services/project.service";
import { createTask, deleteTask, getTaskById, updateTask } from "@/lib/services/task.service";
import {
  CircularDependencyError,
  DependencyNotDoneError,
  DependentEntityExistsError,
  ReadonlyFieldError,
} from "@/lib/errors";
import { cleanupTestData, uniqueName } from "@/lib/services/__tests__/test-helpers";

describe("task dependency gating, cycle prevention, cascade", () => {
  let projectIds: bigint[] = [];
  let taskIds: bigint[] = [];

  afterEach(async () => {
    await cleanupTestData(projectIds, taskIds);
    projectIds = [];
    taskIds = [];
  });

  async function makeProject() {
    const { project } = await createProject({
      name: uniqueName("dep-test"),
      startDate: new Date("2030-03-01"),
      endDate: new Date("2030-03-31"),
    });
    projectIds.push(BigInt(project.id));
    return project;
  }

  it("rejects moving a task to done when its dependency is not done", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    await expect(updateTask(BigInt(b.id), { status: "done" })).rejects.toThrow(
      DependencyNotDoneError,
    );
  });

  it("allows moving to done once the dependency is done", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "done",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    const { task: updated } = await updateTask(BigInt(b.id), { status: "done" });
    expect(updated.status).toBe("done");
  });

  it("cascades a downgrade to dependents", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "done",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "done",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    const { affected } = await updateTask(BigInt(a.id), { status: "in_progress" });
    const bAffected = affected.tasks.find((t) => t.id === b.id);
    expect(bAffected?.status).toBe("in_progress");
  });

  it("rejects a direct self-dependency", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(a.id));

    await expect(
      updateTask(BigInt(a.id), { dependsOn: [a.id] }),
    ).rejects.toThrow(CircularDependencyError);
  });

  it("rejects a transitive circular dependency", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    await expect(
      updateTask(BigInt(a.id), { dependsOn: [b.id] }),
    ).rejects.toThrow(CircularDependencyError);
  });

  it("accepts multiple new edges added in one request when none of them cycle", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    const { task: c } = await createTask({
      projectId: project.id,
      name: uniqueName("C"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(a.id), BigInt(b.id), BigInt(c.id));

    const { task: updated } = await updateTask(BigInt(c.id), { dependsOn: [a.id, b.id] });
    expect(updated.dependsOn.sort()).toEqual([a.id, b.id].sort());
  });

  it("rejects the whole request atomically when only one of several new edges in the same PATCH would cycle", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: harmless } = await createTask({
      projectId: project.id,
      name: uniqueName("harmless"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(harmless.id), BigInt(b.id));

    await expect(
      updateTask(BigInt(a.id), { dependsOn: [harmless.id, b.id] }),
    ).rejects.toThrow(CircularDependencyError);

    const untouched = await getTaskById(BigInt(a.id));
    expect(untouched?.dependsOn).toEqual([]);
  });

  it("rejects status write on a non-leaf task", async () => {
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
      updateTask(BigInt(parent.id), { status: "done" }),
    ).rejects.toThrow(ReadonlyFieldError);
  });

  it("rejects deleting a task that is still depended on by another, with actionable payload", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "draft",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    await expect(deleteTask(BigInt(a.id))).rejects.toThrow(DependentEntityExistsError);

    try {
      await deleteTask(BigInt(a.id));
      throw new Error("expected deleteTask to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DependentEntityExistsError);
      const dependent = (err as InstanceType<typeof DependentEntityExistsError>).dependents[0];
      expect(dependent.id).toBe(b.id);
      expect(dependent.name).toBe(b.name);
      expect(dependent.projectId).toBe(project.id);

      expect(dependent.blockedTaskId).toBe(a.id);
      expect(dependent.blockedTaskName).toBe(a.name);
    }
  });

  it("rejects editing dependsOn to add a not-done dependency to an already-Done task, without touching status", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "draft",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    await expect(updateTask(BigInt(b.id), { dependsOn: [a.id] })).rejects.toThrow(
      DependencyNotDoneError,
    );

    const untouched = await getTaskById(BigInt(b.id));
    expect(untouched?.status).toBe("done");
    expect(untouched?.dependsOn).toEqual([]);
  });

  it("keeps a Done task's status untouched when dependsOn is edited but all dependencies stay Done", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "done",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    const { task: updated } = await updateTask(BigInt(b.id), { dependsOn: [a.id] });
    expect(updated.status).toBe("done");
  });

  it("allows removing a dependency from an already-Done task (removal never trips the gate, only adding an unmet one does)", async () => {
    const project = await makeProject();
    const { task: a } = await createTask({
      projectId: project.id,
      name: uniqueName("A"),
      weight: 1,
      status: "done",
    });
    const { task: b } = await createTask({
      projectId: project.id,
      name: uniqueName("B"),
      weight: 1,
      status: "done",
      dependsOn: [a.id],
    });
    taskIds.push(BigInt(a.id), BigInt(b.id));

    const { task: updated } = await updateTask(BigInt(b.id), { dependsOn: [] });
    expect(updated.status).toBe("done");
  });
});
