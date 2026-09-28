import "server-only";

import { demoRepository } from "@repo/api";
import { createMcpEndpoint } from "./mcp";

// The public endpoint and the homepage client use the same request context factory.
export const mcpEndpoint = createMcpEndpoint({
  // Extend this factory with the caller's identity when adding authentication.
  getContext: (_request) => ({ repository: demoRepository }),
});
