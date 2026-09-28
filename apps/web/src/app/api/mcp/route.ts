import { connection } from "next/server";
import { handleMcpRequest } from "@/lib/mcp-access";
import { mcpEndpoint } from "@/lib/mcp-endpoint";

async function handle(request: Request) {
  // Evaluate enablement on every request, including when a build used MCP_ENABLED=false.
  await connection();
  return handleMcpRequest(request, (incoming) => mcpEndpoint.fetch(incoming));
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
