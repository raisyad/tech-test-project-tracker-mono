import { afterEach, describe, expect, it } from "vitest";
import { createProject, getProjectById } from "@/lib/services/project.service";
import { createTask, updateTask } from "@/lib/services/task.service";
import { findReadonlyProjectField } from "@/lib/validations/project";
import { cleanupTestData, uniqueDateRange, uniqueName } from "@/lib/services/__tests__/test-helpers";

describe("progress formula and status derivation", () => {
  let projectIds: bigint[] = [];
  let taskIds: bigint[] = [];

  afterEach(async () => {
    await cleanupTestData(projectIds, taskIds);
    projectIds = [];
    taskIds = [];
  });

  async function makeProject() {
    const { project } = await createProject({
      name: uniqueName("progress-test"),
      ...uniqueDateRange(),
    });
    projectIds.push(BigInt(project.id));
    return project;
  }

  it("project without tasks has progress 0 and status draft", async () => {
    const project = await makeProject();
    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.completionProgress).toBe(0);
    expect(detail?.status).toBe("draft");
  });

  it("all tasks draft -> project status draft", async () => {
    const project = await makeProject();
    const { task } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(task.id));

    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.status).toBe("draft");
    expect(detail?.completionProgress).toBe(0);
  });

  it("all tasks done -> project status done, progress 100", async () => {
    const project = await makeProject();
    const { task: t1 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 2,
      status: "done",
    });
    const { task: t2 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(t1.id), BigInt(t2.id));

    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.status).toBe("done");
    expect(detail?.completionProgress).toBe(100);
  });

  it("matches wireframe example: weight 2 done + weight 1 not done = 66.67%", async () => {
    const project = await makeProject();
    const { task: t1 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 2,
      status: "done",
    });
    const { task: t2 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(t1.id), BigInt(t2.id));

    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.completionProgress).toBeCloseTo(66.67, 1);
  });

  it("mixed draft+done without in_progress -> status in_progress (documented assumption)", async () => {
    const project = await makeProject();
    const { task: t1 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    const { task: t2 } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "draft",
    });
    taskIds.push(BigInt(t1.id), BigInt(t2.id));

    const detail = await getProjectById(BigInt(project.id));
    expect(detail?.status).toBe("in_progress");
  });

  it("downgrading a done task back to draft recalculates project status down", async () => {
    const project = await makeProject();
    const { task } = await createTask({
      projectId: project.id,
      name: uniqueName("task"),
      weight: 1,
      status: "done",
    });
    taskIds.push(BigInt(task.id));

    let detail = await getProjectById(BigInt(project.id));
    expect(detail?.status).toBe("done");

    await updateTask(BigInt(task.id), { status: "draft" });

    detail = await getProjectById(BigInt(project.id));
    expect(detail?.status).toBe("draft");
    expect(detail?.completionProgress).toBe(0);
  });

  it("detects status and completionProgress as readonly fields", () => {
    expect(findReadonlyProjectField({ status: "done" })).toBe("status");
    expect(findReadonlyProjectField({ completionProgress: 50 })).toBe("completionProgress");
    expect(findReadonlyProjectField({ name: "ok" })).toBeNull();
  });
});
