import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTaskSchema, taskListQuerySchema } from "@/lib/validations/task";
import { createTask, listTasks } from "@/lib/services/task.service";
import { toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = taskListQuerySchema.safeParse({
    projectId: searchParams.get("projectId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_QUERY", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const tasks = await listTasks(parsed.data);
  return NextResponse.json({ data: tasks });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const task = await createTask(parsed.data);
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (err) {
    const errorResponse = toErrorResponse(err);
    if (errorResponse) return errorResponse;
    throw err;
  }
}
