import "server-only";

import { createRouterClient, implement } from "@orpc/server";
import { type ApiClient, contract } from "@repo/contracts";
// demo:start

import type { TaskRepository } from "./repository";
import { tasksRouter } from "./tasks";

// demo:end

/** Dependencies that every procedure receives for one request. */
export interface Context extends Record<never, never> {
  // Add request-scoped dependencies here, such as the session or a database client.
  // demo:start
  repository: TaskRepository;
  // Apps that cache task data can provide their server cache invalidation here.
  onTasksChanged?: () => void | Promise<void>;
  // demo:end
}

const api = implement(contract).$context<Context>();

export const router = api.router({
  // Add each feature's router here.
  // demo:start
  tasks: tasksRouter,
  // demo:end
});

/** Each caller supplies its own context; no request-specific data is stored globally. */
export function createApiClient(context: Context): ApiClient {
  return createRouterClient(router, { context });
}
