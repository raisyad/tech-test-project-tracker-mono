import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProjectSchema,
  findReadonlyProjectField,
  projectListQuerySchema,
} from "@/lib/validations/project";
import { createProject, listProjects } from "@/lib/services/project.service";
import { toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = projectListQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_QUERY", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const projects = await listProjects(parsed.data);
  return NextResponse.json({ data: projects });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const readonlyField = findReadonlyProjectField(body);
  if (readonlyField) {
    return NextResponse.json(
      { error: "READONLY_FIELD", field: readonlyField },
      { status: 422 },
    );
  }

  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const { project, affected } = await createProject(parsed.data);
    return NextResponse.json({ data: project, affected }, { status: 201 });
  } catch (err) {
    const errorResponse = toErrorResponse(err);
    if (errorResponse) return errorResponse;
    throw err;
  }
}
