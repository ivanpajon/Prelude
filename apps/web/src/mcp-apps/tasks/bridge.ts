import { CallToolResultSchema } from "@modelcontextprotocol/core";
import type { App } from "@modelcontextprotocol/ext-apps";

/** Call only after useApp has completed its UI handshake. */
export function callHostTool(
  app: App,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) {
  // ext-apps 2.0.3 negotiates ui/initialize, not the server's MCP dialect.
  // Its convenience method therefore selects a legacy record-only validator.
  // The public v2 schema accepts both natural JSON and legacy wrapped results;
  // transport, cancellation and host permissions still belong to the SDK/host.
  return app.request(
    { method: "tools/call", params: { name, arguments: args } },
    CallToolResultSchema,
    { signal, onprogress: () => {}, resetTimeoutOnProgress: true },
  );
}
