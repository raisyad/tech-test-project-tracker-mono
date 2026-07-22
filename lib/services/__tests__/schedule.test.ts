import { afterEach, describe, expect, it } from "vitest";
import { createProject, getProjectById, updateProject } from "@/lib/services/project.service";
import { ScheduleOverlapError } from "@/lib/errors";
import { cleanupTestData, uniqueName } from "@/lib/services/__tests__/test-helpers";

describe("project schedule non-intersecting", () => {
  let projectIds: bigint[] = [];

  afterEach(async () => {
    await cleanupTestData(projectIds, []);
    projectIds = [];
  });

  it("rejects creating a project with a date range overlapping an existing one", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-06-01"),
      endDate: new Date("2050-06-10"),
    });
    projectIds.push(BigInt(a.id));

    await expect(
      createProject({
        name: uniqueName("sched-b"),
        startDate: new Date("2050-06-05"),
        endDate: new Date("2050-06-15"),
      }),
    ).rejects.toThrow(ScheduleOverlapError);
  });

  it("treats touching boundaries (inclusive) as overlapping", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-07-01"),
      endDate: new Date("2050-07-10"),
    });
    projectIds.push(BigInt(a.id));

    await expect(
      createProject({
        name: uniqueName("sched-b"),
        startDate: new Date("2050-07-10"),
        endDate: new Date("2050-07-20"),
      }),
    ).rejects.toThrow(ScheduleOverlapError);
  });

  it("accepts a non-overlapping date range", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-08-01"),
      endDate: new Date("2050-08-10"),
    });
    projectIds.push(BigInt(a.id));

    const { project: b } = await createProject({
      name: uniqueName("sched-b"),
      startDate: new Date("2050-08-11"),
      endDate: new Date("2050-08-20"),
    });
    projectIds.push(BigInt(b.id));

    expect(b.id).toBeDefined();
  });

  it("excludes the project itself when re-saving the same dates", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-09-01"),
      endDate: new Date("2050-09-10"),
    });
    projectIds.push(BigInt(a.id));

    const { project: updated } = await updateProject(BigInt(a.id), {
      startDate: new Date("2050-09-01"),
      endDate: new Date("2050-09-10"),
    });
    expect(updated.id).toBe(a.id);
  });

  it("rejects and rolls back an update that would overlap another project", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-10-01"),
      endDate: new Date("2050-10-10"),
    });
    const { project: b } = await createProject({
      name: uniqueName("sched-b"),
      startDate: new Date("2050-11-01"),
      endDate: new Date("2050-11-10"),
    });
    projectIds.push(BigInt(a.id), BigInt(b.id));

    await expect(
      updateProject(BigInt(b.id), {
        startDate: new Date("2050-10-05"),
        endDate: new Date("2050-10-15"),
      }),
    ).rejects.toThrow(ScheduleOverlapError);

    const detail = await getProjectById(BigInt(b.id));
    expect(detail?.startDate).toEqual(new Date("2050-11-01T00:00:00.000Z"));
  });

  it("skips the overlap check when dates are not being changed", async () => {
    const { project: a } = await createProject({
      name: uniqueName("sched-a"),
      startDate: new Date("2050-12-01"),
      endDate: new Date("2050-12-10"),
    });
    projectIds.push(BigInt(a.id));

    const { project: updated } = await updateProject(BigInt(a.id), {
      name: "renamed only",
    });
    expect(updated.name).toBe("renamed only");
  });
});
