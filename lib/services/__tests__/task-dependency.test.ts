import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/services/project.service";
import { createTask, deleteTask, updateTask } from "@/lib/services/task.service";
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

  it("rejects moving a task to done when its dependency is not done (§5.3)", async () => {
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

  it("cascades a downgrade to dependents (§5.6)", async () => {
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

  it("rejects a transitive circular dependency (§5.5)", async () => {
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

  it("rejects status write on a non-leaf task (§5.3)", async () => {
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

  it("rejects deleting a task that is still depended on by another (§6.2)", async () => {
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
  });
});
