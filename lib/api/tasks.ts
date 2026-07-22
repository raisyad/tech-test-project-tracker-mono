import type { ProjectStatus } from "@/lib/api/projects";

export type Task = {
  id: number;
  projectId: number;
  name: string;
  status: ProjectStatus;
  weight: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  projectId: number;
  name: string;
  status: ProjectStatus;
  weight: number;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  return body.data as T;
}

export function fetchTasks(): Promise<Task[]> {
  return fetch("/api/tasks").then((res) => handleResponse<Task[]>(res));
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
