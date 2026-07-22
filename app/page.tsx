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

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  done: "Done",
};

function toDateInputValue(isoString: string) {
  return isoString.slice(0, 10);
}

type FormState = {
  name: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
};

const emptyForm: FormState = {
  name: "",
  status: "draft",
  startDate: "",
  endDate: "",
};

export default function Home() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function openCreatePanel() {
    setEditingProject(null);
    setForm(emptyForm);
    setErrorMessage(null);
    setIsPanelOpen(true);
  }

  function openEditPanel(project: Project) {
    setEditingProject(project);
    setForm({
      name: project.name,
      status: project.status,
      startDate: toDateInputValue(project.startDate),
      endDate: toDateInputValue(project.endDate),
    });
    setErrorMessage(null);
    setIsPanelOpen(true);
  }

  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      invalidateProjects();
      setIsPanelOpen(false);
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: FormState }) =>
      updateProject(id, input),
    onSuccess: () => {
      invalidateProjects();
      setIsPanelOpen(false);
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      invalidateProjects();
      setIsPanelOpen(false);
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, input: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleDelete() {
    if (!editingProject) return;
    const confirmed = window.confirm(
      `Hapus project "${editingProject.name}"? Aksi ini tidak bisa dibatalkan.`,
    );
    if (!confirmed) return;
    deleteMutation.mutate(editingProject.id);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-screen bg-zinc-50 font-sans dark:bg-black">
      {/* Panel kiri — list Project */}
      <div className="flex w-full flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={openCreatePanel}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            Add Project
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
          >
            Add Task
          </button>
        </header>

        <div className="flex-1 px-6 py-4">
          {isLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat...</p>
          )}

          {!isLoading && projects?.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada project. Klik &quot;Add Project&quot; untuk membuat data yang pertama.
            </p>
          )}

          <ul className="space-y-2">
            {projects?.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => openEditPanel(project)}
                  className="w-full rounded-md border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
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
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sliding panel kanan — Add/Edit Project */}
      <Transition show={isPanelOpen}>
        <Dialog onClose={() => setIsPanelOpen(false)} className="relative z-50">
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
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
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
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Status
                      </label>
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm({
                            ...form,
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
                          value={form.startDate}
                          onChange={(e) =>
                            setForm({ ...form, startDate: e.target.value })
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
                          value={form.endDate}
                          onChange={(e) =>
                            setForm({ ...form, endDate: e.target.value })
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
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                      >
                        {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                    >
                      {isSaving ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
