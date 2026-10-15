import "server-only";

import { implement } from "@orpc/server";
import { tasksContract } from "@repo/contracts";
import type { Context } from "./router";

const tasks = implement(tasksContract).$context<Context>();

/** The task demo procedures, mounted as `router.tasks`. */
export const tasksRouter = tasks.router({
  list: tasks.list.handler(({ input, context }) => context.repository.list(input.status)),
  create: tasks.create.handler(async ({ input, context }) => {
    const task = context.repository.create(input.title);
    await context.onTasksChanged?.();
    return task;
  }),
  setCompleted: tasks.setCompleted.handler(async ({ input, context, errors }) => {
    const task = context.repository.setCompleted(input.id, input.completed);
    if (!task) throw errors.NOT_FOUND();
    await context.onTasksChanged?.();
    return task;
  }),
  updateTitle: tasks.updateTitle.handler(async ({ input, context, errors }) => {
    const task = context.repository.updateTitle(input.id, input.title);
    if (!task) throw errors.NOT_FOUND();
    await context.onTasksChanged?.();
    return task;
  }),
  delete: tasks.delete.handler(async ({ input, context, errors }) => {
    const task = context.repository.delete(input.id);
    if (!task) throw errors.NOT_FOUND();
    await context.onTasksChanged?.();
    return task;
  }),
});
