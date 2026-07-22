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

export function fetchProjects(): Promise<Project[]> {
  return fetch("/api/projects").then((res) => handleResponse<Project[]>(res));
}

export function createProject(input: ProjectInput): Promise<Project> {
  return fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleResponse<Project>(res));
}

export function updateProject(
  id: number,
  input: Partial<ProjectInput>,
): Promise<Project> {
  return fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleResponse<Project>(res));
}

export function deleteProject(id: number): Promise<void> {
  return fetch(`/api/projects/${id}`, { method: "DELETE" }).then((res) =>
    handleResponse<void>(res),
  );
}
