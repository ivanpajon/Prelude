import "server-only";

import type { Context } from "@repo/api";
// demo:start

import { demoRepository } from "@repo/api";

// demo:end

/** The context that REST, RPC, MCP, and Server Components pass to every procedure. */
export function createRequestContext(): Context {
  return {
    // Add request-scoped dependencies here, such as the session or a database client.
    // demo:start
    repository: demoRepository,
    // demo:end
  };
}
