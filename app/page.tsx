"use client";

import { useState } from "react";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
  type Project,
  type ProjectStatus,
} from "@/lib/api/projects";
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  type Task,
} from "@/lib/api/tasks";
import { applyTreeVisibility } from "@/lib/task-tree";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  done: "Done",
};

function toDateInputValue(isoString: string) {
  return isoString.slice(0, 10);
}

const PROJECT_COLORS = [
  {
    border: "border-l-rose-400",
    dot: "bg-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    accent: "bg-rose-100/70 dark:bg-rose-950/50",
  },
  {
    border: "border-l-orange-400",
    dot: "bg-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    accent: "bg-orange-100/70 dark:bg-orange-950/50",
  },
  {
    border: "border-l-amber-400",
    dot: "bg-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    accent: "bg-amber-100/70 dark:bg-amber-950/50",
  },
  {
    border: "border-l-emerald-400",
    dot: "bg-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    accent: "bg-emerald-100/70 dark:bg-emerald-950/50",
  },
  {
    border: "border-l-teal-400",
    dot: "bg-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    accent: "bg-teal-100/70 dark:bg-teal-950/50",
  },
  {
    border: "border-l-sky-400",
    dot: "bg-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    accent: "bg-sky-100/70 dark:bg-sky-950/50",
  },
  {
    border: "border-l-indigo-400",
    dot: "bg-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    accent: "bg-indigo-100/70 dark:bg-indigo-950/50",
  },
  {
    border: "border-l-violet-400",
    dot: "bg-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    accent: "bg-violet-100/70 dark:bg-violet-950/50",
  },
] as const;

function getProjectColor(projectId: number) {
  return PROJECT_COLORS[projectId % PROJECT_COLORS.length];
}

const STATUS_BADGE: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
};

function CheckCircle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 h-4 w-4 cursor-pointer opacity-0"
      />
      <span className="pointer-events-none h-4 w-4 rounded-full border border-zinc-400 bg-white transition-colors peer-checked:border-emerald-500 peer-checked:bg-emerald-500 dark:border-zinc-600 dark:bg-zinc-800" />
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute h-2.5 w-2.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path
          d="M3.5 8.5L6.5 11.5L12.5 4.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

type ProjectFormState = {
  name: string;
  startDate: string;
  endDate: string;
  dependsOn: number[];
};

const emptyProjectForm: ProjectFormState = {
  name: "",
  startDate: "",
  endDate: "",
  dependsOn: [],
};

type TaskFormState = {
  projectId: number | "";
  parentTaskId: number | "";
  name: string;
  status: ProjectStatus;
  weight: number | "";
  dependsOn: number[];
};

const emptyTaskForm: TaskFormState = {
  projectId: "",
  parentTaskId: "",
  name: "",
  status: "draft",
  weight: "",
  dependsOn: [],
};

function countDescendantTasks(taskId: number, allTasks: Task[]): number {
  const children = allTasks.filter((t) => t.parentTaskId === taskId);
  return children.reduce((sum, child) => sum + 1 + countDescendantTasks(child.id, allTasks), 0);
}

function getDescendantTaskIds(taskId: number, allTasks: Task[]): number[] {
  const children = allTasks.filter((t) => t.parentTaskId === taskId);
  return children.flatMap((child) => [child.id, ...getDescendantTaskIds(child.id, allTasks)]);
}

type PanelMode = "project" | "task" | null;

function buildChildrenMap(tasks: Task[]): Map<number | null, Task[]> {
  const map = new Map<number | null, Task[]>();
  for (const task of tasks) {
    const key = task.parentTaskId;
    const siblings = map.get(key);
    if (siblings) siblings.push(task);
    else map.set(key, [task]);
  }
  return map;
}

function ChevronToggle({
  expanded,
  onToggle,
  title,
}: {
  expanded: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={title}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
      >
        <path
          d="M5 3l6 5-6 5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function TaskTree({
  parentId,
  depth,
  childrenMap,
  color,
  collapsedTasks,
  toggleTaskCollapse,
  onEditTask,
  onAddSubtask,
}: {
  parentId: number | null;
  depth: number;
  childrenMap: Map<number | null, Task[]>;
  color: (typeof PROJECT_COLORS)[number];
  collapsedTasks: Set<number>;
  toggleTaskCollapse: (id: number) => void;
  onEditTask: (task: Task) => void;
  onAddSubtask: (taskId: number) => void;
}) {
  const children = childrenMap.get(parentId) ?? [];
  if (children.length === 0) return null;

  return (
    <ul
      className={
        depth === 0
          ? "space-y-2.5"
          : "ml-2 space-y-2.5 border-l border-dashed border-zinc-400/40 pl-4 dark:border-zinc-500/30"
      }
    >
      {children.map((task) => {
        const hasChildren = (childrenMap.get(task.id)?.length ?? 0) > 0;
        const expanded = !collapsedTasks.has(task.id);
        return (
          <li key={task.id} className={task.dimmed ? "opacity-60" : undefined}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <ChevronToggle
                  expanded={expanded}
                  onToggle={() => toggleTaskCollapse(task.id)}
                  title={expanded ? "Sembunyikan subtask" : "Tampilkan subtask"}
                />
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onEditTask(task)}
                className="min-w-0 flex-1 rounded-md px-2 py-2 text-left hover:bg-white/60 dark:hover:bg-black/20"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />
                    {task.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[task.status]}`}
                  >
                    {STATUS_LABEL[task.status]}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Bobot {task.weight}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onAddSubtask(task.id)}
                title="Tambah subtask ke task ini"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                +
              </button>
            </div>
            {hasChildren && expanded && (
              <div className="mt-2.5">
                <TaskTree
                  parentId={task.id}
                  depth={depth + 1}
                  childrenMap={childrenMap}
                  color={color}
                  collapsedTasks={collapsedTasks}
                  toggleTaskCollapse={toggleTaskCollapse}
                  onEditTask={onEditTask}
                  onAddSubtask={onAddSubtask}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(new Set());

  function toggleProjectCollapse(id: number) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTaskCollapse(id: number) {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["tasks", statusFilter, searchTerm],
    queryFn: () =>
      fetchTasks({
        status: statusFilter || undefined,
        search: searchTerm || undefined,
      }),
  });
  const { data: allTasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => fetchTasks(),
  });

  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function openCreateProjectPanel() {
    setEditingProject(null);
    setProjectForm(emptyProjectForm);
    setErrorMessage(null);
    setPanelMode("project");
  }

  function openEditProjectPanel(project: Project) {
    setEditingProject(project);
    setProjectForm({
      name: project.name,
      startDate: toDateInputValue(project.startDate),
      endDate: toDateInputValue(project.endDate),
      dependsOn: project.dependsOn ?? [],
    });
    setErrorMessage(null);
    setPanelMode("project");
  }

  function openCreateTaskPanel(projectId?: number, parentTaskId?: number) {
    setEditingTask(null);
    setTaskForm({
      ...emptyTaskForm,
      projectId: projectId ?? projects?.[0]?.id ?? "",
      parentTaskId: parentTaskId ?? "",
    });
    setErrorMessage(null);
    setPanelMode("task");
  }

  function openEditTaskPanel(task: Task) {
    setEditingTask(task);
    setTaskForm({
      projectId: task.projectId,
      parentTaskId: task.parentTaskId ?? "",
      name: task.name,
      status: task.status,
      weight: task.weight,
      dependsOn: task.dependsOn ?? [],
    });
    setErrorMessage(null);
    setPanelMode("task");
  }

  function closePanel() {
    setPanelMode(null);
  }

  function patchProjectsCache(entries: Project[]) {
    if (entries.length === 0) return;
    queryClient.setQueryData<Project[]>(["projects"], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((p) => [p.id, p]));
      for (const entry of entries) byId.set(entry.id, entry);
      return [...byId.values()];
    });
  }

  function patchTasksAllCache(entries: Task[]) {
    if (entries.length === 0) return;
    queryClient.setQueryData<Task[]>(["tasks", "all"], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((t) => [t.id, t]));
      for (const entry of entries) byId.set(entry.id, entry);
      return [...byId.values()];
    });
  }

  function removeProjectCache(projectId: number) {
    queryClient.setQueryData<Project[]>(["projects"], (old) =>
      old ? old.filter((p) => p.id !== projectId) : old,
    );
    queryClient.setQueryData<Task[]>(["tasks", "all"], (old) =>
      old ? old.filter((t) => t.projectId !== projectId) : old,
    );
  }

  function removeTaskCache(taskId: number) {
    const all = queryClient.getQueryData<Task[]>(["tasks", "all"]) ?? [];
    const removeIds = new Set([taskId, ...getDescendantTaskIds(taskId, all)]);
    queryClient.setQueryData<Task[]>(["tasks", "all"], (old) =>
      old ? old.filter((t) => !removeIds.has(t.id)) : old,
    );
  }

  function syncFilteredTasksCache() {
    const all = queryClient.getQueryData<Task[]>(["tasks", "all"]);
    if (!all) return;
    queryClient.setQueryData(
      ["tasks", statusFilter, searchTerm],
      applyTreeVisibility(all, {
        status: statusFilter || undefined,
        search: searchTerm || undefined,
      }),
    );
  }

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: ({ data, affected }) => {
      patchProjectsCache([data, ...affected.projects]);
      patchTasksAllCache(affected.tasks);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ProjectFormState }) =>
      updateProject(id, input),
    onSuccess: ({ data, affected }) => {
      patchProjectsCache([data, ...affected.projects]);
      patchTasksAllCache(affected.tasks);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: (_data, projectId) => {
      removeProjectCache(projectId);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: createTask,
    onSuccess: ({ data, affected }) => {
      patchTasksAllCache([data, ...affected.tasks]);
      patchProjectsCache(affected.projects);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: {
        projectId: number;
        parentTaskId: number | null;
        name: string;
        status?: ProjectStatus;
        weight: number;
        dependsOn: number[];
      };
    }) => updateTask(id, input),
    onSuccess: ({ data, affected }) => {
      patchTasksAllCache([data, ...affected.tasks]);
      patchProjectsCache(affected.projects);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: ({ affected }, taskId) => {
      removeTaskCache(taskId);
      patchTasksAllCache(affected.tasks);
      patchProjectsCache(affected.projects);
      syncFilteredTasksCache();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (editingProject) {
      updateProjectMutation.mutate({ id: editingProject.id, input: projectForm });
    } else {
      createProjectMutation.mutate(projectForm);
    }
  }

  function handleTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (taskForm.projectId === "" || taskForm.weight === "") return;
    const baseInput = {
      projectId: Number(taskForm.projectId),
      parentTaskId: taskForm.parentTaskId === "" ? null : Number(taskForm.parentTaskId),
      name: taskForm.name,
      weight: Number(taskForm.weight),
      dependsOn: taskForm.dependsOn,
    };
    if (editingTask) {
      const input = editingTaskHasChildren
        ? baseInput
        : { ...baseInput, status: taskForm.status };
      updateTaskMutation.mutate({ id: editingTask.id, input });
    } else {
      createTaskMutation.mutate({ ...baseInput, status: taskForm.status });
    }
  }

  function handleDeleteProject() {
    if (!editingProject) return;
    const taskCount = allTasks?.filter((t) => t.projectId === editingProject.id).length ?? 0;
    const cascadeNote =
      taskCount > 0
        ? ` Akan ikut menghapus ${taskCount} task di dalamnya.`
        : "";
    const confirmed = window.confirm(
      `Hapus project "${editingProject.name}"?${cascadeNote} Aksi ini tidak bisa dibatalkan.`,
    );
    if (!confirmed) return;
    deleteProjectMutation.mutate(editingProject.id);
  }

  function handleDeleteTask() {
    if (!editingTask) return;
    const descendantCount = allTasks ? countDescendantTasks(editingTask.id, allTasks) : 0;
    const cascadeNote =
      descendantCount > 0
        ? ` Akan ikut menghapus ${descendantCount} subtask di dalamnya.`
        : "";
    const confirmed = window.confirm(
      `Hapus task "${editingTask.name}"?${cascadeNote} Aksi ini tidak bisa dibatalkan.`,
    );
    if (!confirmed) return;
    deleteTaskMutation.mutate(editingTask.id);
  }

  const isSavingProject =
    createProjectMutation.isPending || updateProjectMutation.isPending;
  const isSavingTask =
    createTaskMutation.isPending || updateTaskMutation.isPending;

  const isLoading = isLoadingProjects || isLoadingTasks;
  const hasProjects = (projects?.length ?? 0) > 0;
  const editingTaskHasChildren = editingTask
    ? (allTasks?.some((t) => t.parentTaskId === editingTask.id) ?? false)
    : false;
  const blockingDependencies =
    allTasks?.filter((t) => taskForm.dependsOn.includes(t.id) && t.status !== "done") ?? [];

  const projectPanelColor = editingProject ? getProjectColor(editingProject.id) : null;
  const taskPanelColor =
    typeof taskForm.projectId === "number" ? getProjectColor(taskForm.projectId) : null;

  return (
    <div className="flex h-screen bg-zinc-50 font-sans dark:bg-zinc-900">
      <div className="scrollbar-thin flex w-full flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={openCreateProjectPanel}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            Add Project
          </button>
          <button
            type="button"
            disabled={!hasProjects}
            onClick={() => openCreateTaskPanel()}
            title={!hasProjects ? "Buat project dulu sebelum menambah task" : undefined}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:disabled:text-zinc-600"
          >
            Add Task
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Semua status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Cari task..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex-1 px-6 py-4">
          {isLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat...</p>
          )}

          {!isLoading && !hasProjects && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada project. Klik &quot;Add Project&quot; untuk membuat data yang pertama.
            </p>
          )}

          <ul className="space-y-4">
            {projects
              ?.map((project) => {
                const projectTasks = tasks?.filter((t) => t.projectId === project.id) ?? [];

                const hasActiveFilter = statusFilter !== "" || searchTerm !== "";
                const projectMatches =
                  (!statusFilter || project.status === statusFilter) &&
                  (!searchTerm ||
                    project.name.toLowerCase().includes(searchTerm.toLowerCase()));
                const visible = !hasActiveFilter || projectMatches || projectTasks.length > 0;
                const dimmed = hasActiveFilter && !projectMatches && projectTasks.length > 0;

                return { project, projectTasks, visible, dimmed };
              })
              .filter((entry) => entry.visible)
              .map(({ project, projectTasks, dimmed }) => {
                const color = getProjectColor(project.id);
                const childrenMap = buildChildrenMap(projectTasks);
                const projectExpanded = !collapsedProjects.has(project.id);
                return (
                <li key={project.id} className={dimmed ? "opacity-60" : undefined}>
                  <div
                    className={`overflow-hidden rounded-md border border-l-4 border-zinc-200 dark:border-zinc-700/80 ${color.border} ${color.bg}`}
                  >
                    <div className="flex items-center gap-2 px-4 py-3">
                      {projectTasks.length > 0 ? (
                        <ChevronToggle
                          expanded={projectExpanded}
                          onToggle={() => toggleProjectCollapse(project.id)}
                          title={projectExpanded ? "Sembunyikan task" : "Tampilkan task"}
                        />
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => openEditProjectPanel(project)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                            {project.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[project.status]}`}
                          >
                            {STATUS_LABEL[project.status]}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {project.startDate.slice(0, 10)} &ndash; {project.endDate.slice(0, 10)}
                          {" · "}
                          {project.completionProgress}%
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCreateTaskPanel(project.id)}
                        title="Tambah task ke project ini"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        +
                      </button>
                    </div>

                    {projectTasks.length > 0 && projectExpanded && (
                      <div
                        className={`border-t border-zinc-950/5 px-4 py-3 dark:border-white/5 ${color.accent}`}
                      >
                        <TaskTree
                          parentId={null}
                          depth={0}
                          childrenMap={childrenMap}
                          color={color}
                          collapsedTasks={collapsedTasks}
                          toggleTaskCollapse={toggleTaskCollapse}
                          onEditTask={openEditTaskPanel}
                          onAddSubtask={(taskId) => openCreateTaskPanel(project.id, taskId)}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <Transition show={panelMode !== null}>
        <Dialog onClose={closePanel} className="relative z-50">
          <TransitionChild
            enter="ease-in-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in-out duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </TransitionChild>

          <div className="fixed inset-0 flex justify-end">
            <TransitionChild
              enter="transform transition ease-in-out duration-300"
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in-out duration-300"
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <DialogPanel className="flex h-full w-full max-w-md flex-col bg-white dark:bg-zinc-900">
                {panelMode === "project" && (
                  <form onSubmit={handleProjectSubmit} className="flex h-full flex-col">
                    {projectPanelColor && <div className={`h-1.5 shrink-0 ${projectPanelColor.dot}`} />}
                    <div
                      className={`flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 ${projectPanelColor?.bg ?? ""}`}
                    >
                      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {projectPanelColor && (
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${projectPanelColor.dot}`} />
                        )}
                        {editingProject ? "Edit Project" : "Add Project"}
                      </h2>
                    </div>

                    <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {errorMessage && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                          {errorMessage}
                        </p>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Nama
                        </label>
                        <input
                          type="text"
                          required
                          value={projectForm.name}
                          onChange={(e) =>
                            setProjectForm({ ...projectForm, name: e.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Status
                        </label>
                        <div className="mt-1">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE[editingProject?.status ?? "draft"]}`}
                          >
                            {STATUS_LABEL[editingProject?.status ?? "draft"]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          Dihitung otomatis dari status task di project ini.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Start Date
                          </label>
                          <input
                            type="date"
                            required
                            value={projectForm.startDate}
                            onChange={(e) =>
                              setProjectForm({ ...projectForm, startDate: e.target.value })
                            }
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="mt-1 w-full cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            End Date
                          </label>
                          <input
                            type="date"
                            required
                            value={projectForm.endDate}
                            onChange={(e) =>
                              setProjectForm({ ...projectForm, endDate: e.target.value })
                            }
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="mt-1 w-full cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Dependencies
                        </label>
                        <div className="scrollbar-thin mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-300 p-2 dark:border-zinc-700">
                          {projects
                            ?.filter((p) => p.id !== editingProject?.id)
                            .map((p) => (
                              <label
                                key={p.id}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                              >
                                <CheckCircle
                                  checked={projectForm.dependsOn.includes(p.id)}
                                  onChange={(checked) =>
                                    setProjectForm({
                                      ...projectForm,
                                      dependsOn: checked
                                        ? [...projectForm.dependsOn, p.id]
                                        : projectForm.dependsOn.filter((id) => id !== p.id),
                                    })
                                  }
                                />
                                {p.name}
                              </label>
                            ))}
                          {projects?.filter((p) => p.id !== editingProject?.id).length === 0 && (
                            <p className="text-xs text-zinc-400">Belum ada project lain.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                      {editingProject ? (
                        <button
                          type="button"
                          onClick={handleDeleteProject}
                          disabled={deleteProjectMutation.isPending}
                          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                        >
                          {deleteProjectMutation.isPending ? "Menghapus..." : "Hapus"}
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="submit"
                        disabled={isSavingProject}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                      >
                        {isSavingProject ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </form>
                )}

                {panelMode === "task" && (
                  <form onSubmit={handleTaskSubmit} className="flex h-full flex-col">
                    {taskPanelColor && <div className={`h-1.5 shrink-0 ${taskPanelColor.dot}`} />}
                    <div
                      className={`flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 ${taskPanelColor?.bg ?? ""}`}
                    >
                      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {taskPanelColor && (
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${taskPanelColor.dot}`} />
                        )}
                        {editingTask ? "Edit Task" : "Add Task"}
                      </h2>
                    </div>

                    <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {errorMessage && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                          {errorMessage}
                        </p>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Project
                        </label>
                        <select
                          required
                          value={taskForm.projectId}
                          onChange={(e) =>
                            setTaskForm({ ...taskForm, projectId: Number(e.target.value) })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          <option value="" disabled>
                            Pilih project
                          </option>
                          {projects?.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Parent Task
                        </label>
                        <select
                          value={taskForm.parentTaskId}
                          onChange={(e) =>
                            setTaskForm({
                              ...taskForm,
                              parentTaskId: e.target.value === "" ? "" : Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          <option value="">Tidak ada (top-level task)</option>
                          {allTasks
                            ?.filter(
                              (t) =>
                                t.id !== editingTask?.id && t.projectId === taskForm.projectId,
                            )
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Nama
                        </label>
                        <input
                          type="text"
                          required
                          value={taskForm.name}
                          onChange={(e) =>
                            setTaskForm({ ...taskForm, name: e.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Status
                        </label>
                        {editingTaskHasChildren ? (
                          <>
                            <div className="mt-1">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE[editingTask?.status ?? "draft"]}`}
                              >
                                {STATUS_LABEL[editingTask?.status ?? "draft"]}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-400">
                              Dihitung otomatis dari status subtask.
                            </p>
                          </>
                        ) : (
                          <>
                            <select
                              value={taskForm.status}
                              onChange={(e) =>
                                setTaskForm({
                                  ...taskForm,
                                  status: e.target.value as ProjectStatus,
                                })
                              }
                              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                  disabled={value === "done" && blockingDependencies.length > 0}
                                  title={
                                    value === "done" && blockingDependencies.length > 0
                                      ? `Diblokir oleh: ${blockingDependencies.map((d) => d.name).join(", ")}`
                                      : undefined
                                  }
                                >
                                  {label}
                                </option>
                              ))}
                            </select>
                            {blockingDependencies.length > 0 && (
                              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                Tidak bisa Done, menunggu: {blockingDependencies.map((d) => d.name).join(", ")}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Bobot
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={taskForm.weight}
                          onChange={(e) =>
                            setTaskForm({
                              ...taskForm,
                              weight: e.target.value === "" ? "" : Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Dependencies
                        </label>
                        <div className="scrollbar-thin mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-300 p-2 dark:border-zinc-700">
                          {allTasks
                            ?.filter((t) => t.id !== editingTask?.id)
                            .map((t) => (
                              <label
                                key={t.id}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                              >
                                <CheckCircle
                                  checked={taskForm.dependsOn.includes(t.id)}
                                  onChange={(checked) =>
                                    setTaskForm({
                                      ...taskForm,
                                      dependsOn: checked
                                        ? [...taskForm.dependsOn, t.id]
                                        : taskForm.dependsOn.filter((id) => id !== t.id),
                                    })
                                  }
                                />
                                {t.name}
                              </label>
                            ))}
                          {allTasks?.filter((t) => t.id !== editingTask?.id).length === 0 && (
                            <p className="text-xs text-zinc-400">Belum ada task lain.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                      {editingTask ? (
                        <button
                          type="button"
                          onClick={handleDeleteTask}
                          disabled={deleteTaskMutation.isPending}
                          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                        >
                          {deleteTaskMutation.isPending ? "Menghapus..." : "Hapus"}
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="submit"
                        disabled={isSavingTask}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                      >
                        {isSavingTask ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </form>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
