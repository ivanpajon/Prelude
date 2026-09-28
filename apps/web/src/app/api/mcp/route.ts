import { demoRepository } from "@repo/api";
import { connection } from "next/server";
import { createMcpEndpoint } from "@/lib/mcp";
import { handleMcpRequest } from "@/lib/mcp-access";

const endpoint = createMcpEndpoint({
  // Extend this factory with the caller's identity when adding authentication.
  getContext: (_request) => ({ repository: demoRepository }),
});

async function handle(request: Request) {
  // Evaluate enablement on every request, including when a build used MCP_ENABLED=false.
  await connection();
  return handleMcpRequest(request, (incoming) => endpoint.fetch(incoming));
}

export {
  handle as GET,
  handle as POST,
  handle as DELETE,
  handle as PUT,
  handle as PATCH,
  handle as HEAD,
  handle as OPTIONS,
};
