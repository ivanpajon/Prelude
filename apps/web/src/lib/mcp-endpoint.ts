import "server-only";

import { createMcpEndpoint } from "./mcp";
import { generateOpenApiSpec, handleOpenApiRequest } from "./openapi";
import { createRequestContext } from "./request-context";

// The public route and in-process callers share this endpoint.
export const mcpEndpoint = createMcpEndpoint({
  getSpec: generateOpenApiSpec,
  dispatch: handleOpenApiRequest,
  // Extend the factory with the caller's identity when adding authentication.
  getContext: (_request) => createRequestContext(),
});
