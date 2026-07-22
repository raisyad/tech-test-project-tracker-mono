import { NextResponse } from "next/server";

export class CircularDependencyError extends Error {
  cyclePath: number[];

  constructor(cyclePath: number[]) {
    super("Perubahan ini akan membentuk circular dependency");
    this.cyclePath = cyclePath;
  }
}

export class DependencyNotDoneError extends Error {
  blockingDependencies: { id: number; name: string; status: string }[];

  constructor(blockingDependencies: { id: number; name: string; status: string }[]) {
    super("Task tidak bisa diubah ke Done, ada dependency yang belum Done");
    this.blockingDependencies = blockingDependencies;
  }
}

export class DependentEntityExistsError extends Error {
  dependents: { id: number; name: string }[];

  constructor(dependents: { id: number; name: string }[]) {
    super("Entity masih di-depend oleh entity lain");
    this.dependents = dependents;
  }
}

export function toErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof CircularDependencyError) {
    return NextResponse.json(
      { error: "CIRCULAR_DEPENDENCY", cyclePath: err.cyclePath },
      { status: 409 },
    );
  }
  if (err instanceof DependencyNotDoneError) {
    return NextResponse.json(
      { error: "DEPENDENCY_NOT_DONE", blockingDependencies: err.blockingDependencies },
      { status: 422 },
    );
  }
  if (err instanceof DependentEntityExistsError) {
    return NextResponse.json(
      { error: "DEPENDENT_ENTITY_EXISTS", dependents: err.dependents },
      { status: 409 },
    );
  }
  return null;
}
