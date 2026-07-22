import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProjectSchema,
  projectListQuerySchema,
} from "@/lib/validations/project";
import { createProject, listProjects } from "@/lib/services/project.service";

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
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const project = await createProject(parsed.data);
  return NextResponse.json({ data: project }, { status: 201 });
}
