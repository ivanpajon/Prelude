import "server-only";

import { type McpEnvironment, rejectNonLocalRequest, withoutMcpCache } from "./mcp-access";

export function handleInspectorRequest(
  request: Request,
  environment: McpEnvironment = process.env,
): Response {
  if (environment.NODE_ENV !== "development") {
    return withoutMcpCache(new Response("Not found", { status: 404 }));
  }
  const rejected = rejectNonLocalRequest(request);
  if (rejected) return withoutMcpCache(rejected);
  if (!["GET", "HEAD"].includes(request.method)) {
    return withoutMcpCache(
      new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } }),
    );
  }
  const port = environment.MCP_INSPECTOR_PORT ?? "6274";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return withoutMcpCache(new Response("Invalid MCP_INSPECTOR_PORT.", { status: 500 }));
  }
  const inspectorOrigin = `http://127.0.0.1:${Number(port)}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prelude MCP Inspector</title>
<style>html,body{height:100%;margin:0}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body><iframe src="${inspectorOrigin}/" title="Prelude MCP Inspector"></iframe></body>
</html>`;
  return withoutMcpCache(
    new Response(request.method === "HEAD" ? null : html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; frame-src ${inspectorOrigin}; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );
}
