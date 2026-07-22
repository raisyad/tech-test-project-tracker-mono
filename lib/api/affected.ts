import type { Project } from "@/lib/api/projects";
import type { Task } from "@/lib/api/tasks";

export type Affected = {
  projects: Project[];
  tasks: Task[];
};
