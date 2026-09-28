import { withoutMcpCache } from "@/lib/mcp-access";
import { handleInspectorRequest } from "@/lib/mcp-inspector";

function handle(request: Request) {
  // Never forward Inspector's assets or backend through the application origin.
  if (new URL(request.url).pathname.replace(/\/$/, "") !== "/api/mcp/inspector") {
    return withoutMcpCache(new Response("Not found", { status: 404 }));
  }
  return handleInspectorRequest(request);
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
