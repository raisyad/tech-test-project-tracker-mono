"use client";

import { useState } from "react";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";

export default function Home() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans dark:bg-black">
      {/* Panel kiri — list Project & Task */}
      <div className="flex w-full flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            Add Project
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Add Task
          </button>
        </header>

        <div className="flex-1 px-6 py-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada project. List Project/Task akan tampil di sini.
          </p>

        </div>
      </div>

      {/* Sliding panel kanan — Add/Edit */}
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
                <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Add Project/Task
                  </h2>
                </div>

                <div className="flex-1 px-6 py-4">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Form akan diisi di modul berikutnya.
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                  <button
                    type="button"
                    className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    Hapus
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                  >
                    Simpan
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
