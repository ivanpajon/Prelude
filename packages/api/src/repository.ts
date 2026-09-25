import "server-only";

import type { Task, TaskStatus } from "@repo/contracts";

export interface TaskRepository {
  list(status: TaskStatus): Task[];
  create(title: string): Task;
  setCompleted(id: string, completed: boolean): Task | undefined;
}

const initialTasks: readonly Task[] = [
  { id: "explore", title: "Explore the workspace", completed: true },
  { id: "feature", title: "Create your first feature", completed: false },
  { id: "customize", title: "Make this template yours", completed: false },
];

/**
 * A replaceable demonstration adapter, with fresh state for every factory call.
 * Returned objects are copies so callers cannot mutate the backing collection.
 */
export function createDemoRepository(seed: readonly Task[] = initialTasks): TaskRepository {
  const tasks = new Map(seed.map((task) => [task.id, { ...task }]));

  return {
    list(status) {
      return [...tasks.values()]
        .filter((task) => status === "all" || task.completed === (status === "completed"))
        .map((task) => ({ ...task }));
    },
    create(title) {
      const task: Task = { id: crypto.randomUUID(), title, completed: false };
      tasks.set(task.id, task);
      return { ...task };
    },
    setCompleted(id, completed) {
      const task = tasks.get(id);
      if (!task) return undefined;
      const updated = { ...task, completed };
      tasks.set(id, updated);
      return { ...updated };
    },
  };
}

/**
 * Shared PUBLIC demo data for this process only. All visitors see the same list;
 * it resets on restart and is not synchronized across server instances.
 * Replace this adapter with persistent, authorized data access before production.
 */
// Next may evaluate page and Route Handler bundles separately. A process-wide
// slot keeps their PUBLIC demo dataset aligned and survives development reloads.
// Never put request context, credentials, or per-user state in this slot.
const demoGlobal = globalThis as typeof globalThis & {
  __nextTemplateDemoRepository?: TaskRepository;
};
demoGlobal.__nextTemplateDemoRepository ??= createDemoRepository();
export const demoRepository = demoGlobal.__nextTemplateDemoRepository;
