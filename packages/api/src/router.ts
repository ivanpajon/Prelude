import "server-only";

import { createRouterClient, implement } from "@orpc/server";
import { type ApiClient, contract } from "@repo/contracts";
import type { TaskRepository } from "./repository";

export interface Context {
  repository: TaskRepository;
  // Apps that cache task data can provide their server cache invalidation here.
  onTasksChanged?: () => void | Promise<void>;
}

const api = implement(contract).$context<Context>();

export const router = api.router({
  tasks: {
    list: api.tasks.list.handler(({ input, context }) => context.repository.list(input.status)),
    create: api.tasks.create.handler(async ({ input, context }) => {
      const task = context.repository.create(input.title);
      await context.onTasksChanged?.();
      return task;
    }),
    setCompleted: api.tasks.setCompleted.handler(async ({ input, context, errors }) => {
      const task = context.repository.setCompleted(input.id, input.completed);
      if (!task) throw errors.NOT_FOUND();
      await context.onTasksChanged?.();
      return task;
    }),
  },
});

/** Each caller supplies its own context; no request-specific data is stored globally. */
export function createApiClient(context: Context): ApiClient {
  return createRouterClient(router, { context });
}
