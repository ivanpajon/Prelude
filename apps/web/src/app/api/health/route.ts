import { connection } from "next/server";

/**
 * Liveness check for containers and load balancers. It reads no data and is not part of
 * the API contract, so it is neither an OpenAPI operation nor an MCP tool.
 */
async function handle() {
  // Compute it per request, so the check exercises the running server, not a build-time copy.
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as HEAD };
