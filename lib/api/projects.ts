import type { Affected } from "@/lib/api/affected";

export type ProjectStatus = "draft" | "in_progress" | "done";

export type Project = {
  id: number;
  name: string;
  status: ProjectStatus;
  completionProgress: number;
  startDate: string;
  endDate: string;
  dependsOn: number[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  startDate: string;
  endDate: string;
  dependsOn?: number[];
};

function buildErrorMessage(body: Record<string, unknown>, status: number): string {
  switch (body.error) {
    case "CIRCULAR_DEPENDENCY":
      return "Perubahan ini akan membentuk circular dependency antar project";
    case "DEPENDENT_ENTITY_EXISTS": {
      const dependents = body.dependents as { name: string }[] | undefined;
      const names = dependents?.map((d) => d.name).join(", ");
      return `Masih di-depend oleh entity lain: ${names}`;
    }
    case "SCHEDULE_OVERLAP": {
      const conflict = body.conflictingProject as
        | { name: string; startDate: string; endDate: string }
        | undefined;
      if (!conflict) return "Jadwal bentrok dengan project lain";
      return `Jadwal bentrok dengan "${conflict.name}" (${conflict.startDate.slice(0, 10)} – ${conflict.endDate.slice(0, 10)})`;
    }
    default:
      return typeof body.error === "string" ? body.error : `Request failed (${status})`;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(buildErrorMessage(body, res.status));
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  return body.data as T;
}

async function handleMutationResponse<T>(
  res: Response,
): Promise<{ data: T; affected: Affected }> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(buildErrorMessage(body, res.status));
  }
  const body = await res.json();
  return { data: body.data as T, affected: body.affected as Affected };
}

export function fetchProjects(): Promise<Project[]> {
  return fetch("/api/projects").then((res) => handleResponse<Project[]>(res));
}

export function createProject(
  input: ProjectInput,
): Promise<{ data: Project; affected: Affected }> {
  return fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleMutationResponse<Project>(res));
}

export function updateProject(
  id: number,
  input: Partial<ProjectInput>,
): Promise<{ data: Project; affected: Affected }> {
  return fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleMutationResponse<Project>(res));
}

export function deleteProject(id: number): Promise<void> {
  return fetch(`/api/projects/${id}`, { method: "DELETE" }).then((res) =>
    handleResponse<void>(res),
  );
}
