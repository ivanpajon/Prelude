import "server-only";

import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";

export interface McpEnvironment {
  NODE_ENV?: string | undefined;
  MCP_ENABLED?: string | undefined;
  MCP_ALLOWED_ORIGINS?: string | undefined;
  MCP_INSPECTOR_PORT?: string | undefined;
}

export function withoutMcpCache(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function origin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.includes("*")
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function rejectNonLocalRequest(request: Request): Response | undefined {
  // Request.url may contain Next's bind host. Validate the actual inbound headers.
  if (request.headers.has("origin") && !origin(request.headers.get("origin") ?? "")) {
    return new Response("Forbidden origin", { status: 403 });
  }
  return (
    hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
    originValidationResponse(request, localhostAllowedOrigins())
  );
}

export function rejectMcpRequest(
  request: Request,
  environment: McpEnvironment,
): Response | undefined {
  const enabled = environment.MCP_ENABLED?.trim().toLowerCase();
  if (enabled === "false") return new Response("Not found", { status: 404 });
  if (enabled !== undefined && enabled !== "true") {
    throw new Error("MCP_ENABLED must be true or false when set.");
  }
  if (environment.NODE_ENV === "development") return rejectNonLocalRequest(request);

  const allowedOrigins = environment.MCP_ALLOWED_ORIGINS?.trim()
    ? environment.MCP_ALLOWED_ORIGINS.split(",").map((entry) => {
        const parsed = origin(entry.trim());
        if (!parsed) throw new Error("MCP_ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
        return parsed;
      })
    : [];
  // Native clients (including Inspector's backend) do not need a browser Origin.
  if (!request.headers.has("origin")) return undefined;
  const callerOrigin = origin(request.headers.get("origin") ?? "");
  if (!callerOrigin || !allowedOrigins.includes(callerOrigin)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  return undefined;
}

export async function handleMcpRequest(
  request: Request,
  fetch: (request: Request) => Promise<Response>,
  environment: McpEnvironment = process.env,
): Promise<Response> {
  try {
    return withoutMcpCache(rejectMcpRequest(request, environment) ?? (await fetch(request)));
  } catch (error) {
    console.error("MCP request failed:", error);
    return withoutMcpCache(
      new Response("MCP request failed. Check the server logs.", { status: 500 }),
    );
  }
}
