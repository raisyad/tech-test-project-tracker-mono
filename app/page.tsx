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
  status: ProjectStatus;
  startDate: string;
  endDate: string;
};

const emptyProjectForm: ProjectFormState = {
  name: "",
  status: "draft",
  startDate: "",
  endDate: "",
};

type TaskFormState = {
  projectId: number | "";
  name: string;
  status: ProjectStatus;
  weight: number | "";
};

const emptyTaskForm: TaskFormState = {
  projectId: "",
  name: "",
  status: "draft",
  weight: "",
};

type PanelMode = "project" | "task" | null;

export default function Home() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
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
      status: project.status,
      startDate: toDateInputValue(project.startDate),
      endDate: toDateInputValue(project.endDate),
    });
    setErrorMessage(null);
    setPanelMode("project");
  }

  function openCreateTaskPanel(projectId?: number) {
    setEditingTask(null);
    setTaskForm({
      ...emptyTaskForm,
      projectId: projectId ?? projects?.[0]?.id ?? "",
    });
    setErrorMessage(null);
    setPanelMode("task");
  }

  function openEditTaskPanel(task: Task) {
    setEditingTask(task);
    setTaskForm({
      projectId: task.projectId,
      name: task.name,
      status: task.status,
      weight: task.weight,
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

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      invalidateProjects();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ProjectFormState }) =>
      updateProject(id, input),
    onSuccess: () => {
      invalidateProjects();
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
    onSuccess: () => {
      invalidateTasks();
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
      input: { projectId: number; name: string; status: ProjectStatus; weight: number };
    }) => updateTask(id, input),
    onSuccess: () => {
      invalidateTasks();
      closePanel();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidateTasks();
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
    const input = {
      projectId: Number(taskForm.projectId),
      name: taskForm.name,
      status: taskForm.status,
      weight: Number(taskForm.weight),
    };
    if (editingTask) {
      updateTaskMutation.mutate({ id: editingTask.id, input });
    } else {
      createTaskMutation.mutate(input);
    }
  }

  function handleDeleteProject() {
    if (!editingProject) return;
    const confirmed = window.confirm(
      `Hapus project "${editingProject.name}"? Aksi ini tidak bisa dibatalkan.`,
    );
    if (!confirmed) return;
    deleteProjectMutation.mutate(editingProject.id);
  }

  function handleDeleteTask() {
    if (!editingTask) return;
    const confirmed = window.confirm(
      `Hapus task "${editingTask.name}"? Aksi ini tidak bisa dibatalkan.`,
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
            {projects?.map((project) => {
              const projectTasks = tasks?.filter((t) => t.projectId === project.id) ?? [];
              return (
                <li key={project.id}>
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
                      <ul className="space-y-1 border-t border-zinc-100 px-4 py-2 pl-8 dark:border-zinc-900">
                        {projectTasks.map((task) => (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => openEditTaskPanel(task)}
                              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
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
                        <select
                          value={projectForm.status}
                          onChange={(e) =>
                            setProjectForm({
                              ...projectForm,
                              status: e.target.value as ProjectStatus,
                            })
                          }
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {Object.entries(STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
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
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
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
