import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { updateTaskSchema } from "@/lib/validations/task";
import { deleteTask, getTaskById, updateTask } from "@/lib/services/task.service";

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

  const task = await getTaskById(id);
  if (!task) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: task });
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
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const task = await updateTask(id, parsed.data);
    return NextResponse.json({ data: task });
  } catch (err) {
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
    await deleteTask(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    throw err;
  }
}
