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

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  done: "Done",
};

function toDateInputValue(isoString: string) {
  return isoString.slice(0, 10);
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

function getTaskDepth(task: Task, taskById: Map<number, Task>): number {
  let depth = 0;
  let current: Task | undefined = task;
  while (current && current.parentTaskId !== null) {
    current = taskById.get(current.parentTaskId);
    if (!current) break;
    depth++;
  }
  return depth;
}

function countDescendantTasks(taskId: number, allTasks: Task[]): number {
  const children = allTasks.filter((t) => t.parentTaskId === taskId);
  return children.reduce((sum, child) => sum + 1 + countDescendantTasks(child.id, allTasks), 0);
}

type PanelMode = "project" | "task" | null;

export default function Home() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [searchTerm, setSearchTerm] = useState("");

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

  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const invalidateFilteredTasks = () =>
    queryClient.invalidateQueries({
      queryKey: ["tasks", statusFilter, searchTerm],
      exact: true,
    });

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

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: ({ data, affected }) => {
      patchProjectsCache([data, ...affected.projects]);
      patchTasksAllCache(affected.tasks);
      invalidateFilteredTasks();
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
      invalidateFilteredTasks();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      invalidateProjects();
      invalidateTasks();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: createTask,
    onSuccess: ({ data, affected }) => {
      patchTasksAllCache([data, ...affected.tasks]);
      patchProjectsCache(affected.projects);
      invalidateFilteredTasks();
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
      invalidateFilteredTasks();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidateTasks();
      invalidateProjects();
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

  return (
    <div className="flex h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="flex w-full flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
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

          <ul className="space-y-3">
            {projects
              ?.map((project) => {
                const projectTasks = tasks?.filter((t) => t.projectId === project.id) ?? [];
                const taskById = new Map(projectTasks.map((t) => [t.id, t]));

                const hasActiveFilter = statusFilter !== "" || searchTerm !== "";
                const projectMatches =
                  (!statusFilter || project.status === statusFilter) &&
                  (!searchTerm ||
                    project.name.toLowerCase().includes(searchTerm.toLowerCase()));
                const visible = !hasActiveFilter || projectMatches || projectTasks.length > 0;
                const dimmed = hasActiveFilter && !projectMatches && projectTasks.length > 0;

                return { project, projectTasks, taskById, visible, dimmed };
              })
              .filter((entry) => entry.visible)
              .map(({ project, projectTasks, taskById, dimmed }) => {
                return (
                <li key={project.id} className={dimmed ? "opacity-60" : undefined}>
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEditProjectPanel(project)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {project.name}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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

                    {projectTasks.length > 0 && (
                      <ul className="space-y-1 border-t border-zinc-100 px-4 py-2 dark:border-zinc-900">
                        {projectTasks.map((task) => (
                          <li
                            key={task.id}
                            style={{ paddingLeft: getTaskDepth(task, taskById) * 20 + 16 }}
                            className={task.dimmed ? "opacity-60" : undefined}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditTaskPanel(task)}
                                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                                    {task.name}
                                  </span>
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                    {STATUS_LABEL[task.status]}
                                  </span>
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Bobot {task.weight}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => openCreateTaskPanel(project.id, task.id)}
                                title="Tambah subtask ke task ini"
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                              >
                                +
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
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
              <DialogPanel className="flex h-full w-full max-w-md flex-col bg-white dark:bg-zinc-950">
                {panelMode === "project" && (
                  <form onSubmit={handleProjectSubmit} className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {editingProject ? "Edit Project" : "Add Project"}
                      </h2>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
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
                          <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
                        <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-300 p-2 dark:border-zinc-700">
                          {projects
                            ?.filter((p) => p.id !== editingProject?.id)
                            .map((p) => (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={projectForm.dependsOn.includes(p.id)}
                                  onChange={(e) =>
                                    setProjectForm({
                                      ...projectForm,
                                      dependsOn: e.target.checked
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
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {editingTask ? "Edit Task" : "Add Task"}
                      </h2>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
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
                              <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
                        <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-300 p-2 dark:border-zinc-700">
                          {allTasks
                            ?.filter((t) => t.id !== editingTask?.id)
                            .map((t) => (
                              <label
                                key={t.id}
                                className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={taskForm.dependsOn.includes(t.id)}
                                  onChange={(e) =>
                                    setTaskForm({
                                      ...taskForm,
                                      dependsOn: e.target.checked
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
