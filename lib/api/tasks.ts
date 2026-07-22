import type { ProjectStatus } from "@/lib/api/projects";

export type Task = {
  id: number;
  projectId: number;
  parentTaskId: number | null;
  name: string;
  status: ProjectStatus;
  weight: number;
  dependsOn: number[];
  dimmed?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  projectId: number;
  parentTaskId?: number | null;
  name: string;
  status: ProjectStatus;
  weight: number;
  dependsOn?: number[];
};

export type TaskListFilters = {
  projectId?: number;
  status?: ProjectStatus;
  search?: string;
};

function buildErrorMessage(body: Record<string, unknown>, status: number): string {
  switch (body.error) {
    case "DEPENDENCY_NOT_DONE": {
      const blocking = body.blockingDependencies as { name: string }[] | undefined;
      const names = blocking?.map((b) => b.name).join(", ");
      return `Tidak bisa diubah ke Done, dependency belum Done: ${names}`;
    }
    case "CIRCULAR_DEPENDENCY":
      return "Perubahan ini akan membentuk circular dependency antar task";
    case "DEPENDENT_ENTITY_EXISTS": {
      const dependents = body.dependents as { name: string }[] | undefined;
      const names = dependents?.map((d) => d.name).join(", ");
      return `Masih di-depend oleh task lain: ${names}`;
    }
    case "READONLY_FIELD":
      return `Field ${body.field} dihitung otomatis dari subtask, tidak bisa diubah manual`;
    case "INVALID_PARENT_TASK":
      return typeof body.message === "string" ? body.message : "Parent task tidak valid";
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

export function fetchTasks(filters: TaskListFilters = {}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", String(filters.projectId));
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return fetch(`/api/tasks${query ? `?${query}` : ""}`).then((res) =>
    handleResponse<Task[]>(res),
  );
}

export function createTask(input: TaskInput): Promise<Task> {
  return fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleResponse<Task>(res));
}

export function updateTask(
  id: number,
  input: Partial<TaskInput>,
): Promise<Task> {
  return fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => handleResponse<Task>(res));
}

export function deleteTask(id: number): Promise<void> {
  return fetch(`/api/tasks/${id}`, { method: "DELETE" }).then((res) =>
    handleResponse<void>(res),
  );
}
