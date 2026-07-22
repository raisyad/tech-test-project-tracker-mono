import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { findReadonlyProjectField, updateProjectSchema } from "@/lib/validations/project";
import {
  deleteProject,
  getProjectById,
  updateProject,
} from "@/lib/services/project.service";
import { toErrorResponse } from "@/lib/errors";

function parseId(idParam: string): bigint | null {
  if (!/^\d+$/.test(idParam)) return null;
  return BigInt(idParam);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 422 });
  }

  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: project });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 422 });
  }

  const body = await request.json();

  const readonlyField = findReadonlyProjectField(body);
  if (readonlyField) {
    return NextResponse.json(
      { error: "READONLY_FIELD", field: readonlyField },
      { status: 422 },
    );
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const { project, affected } = await updateProject(id, parsed.data);
    return NextResponse.json({ data: project, affected });
  } catch (err) {
    const errorResponse = toErrorResponse(err);
    if (errorResponse) return errorResponse;

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 422 });
  }

  try {
    await deleteProject(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const errorResponse = toErrorResponse(err);
    if (errorResponse) return errorResponse;

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    throw err;
  }
}
