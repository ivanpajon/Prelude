import "server-only";

import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { parseOrigin, parseServerEnvironment, type RuntimeEnvironment } from "@/env";
import { logServerError } from "./server-log";

export function withoutMcpCache(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function rejectNonLocalRequest(request: Request): Response | undefined {
  // Request.url may contain Next's bind host. Validate the actual inbound headers.
  if (request.headers.has("origin") && !parseOrigin(request.headers.get("origin") ?? "")) {
    return new Response("Forbidden origin", { status: 403 });
  }
  return (
    hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
    originValidationResponse(request, localhostAllowedOrigins())
  );
}

export function rejectMcpRequest(
  request: Request,
  environment: RuntimeEnvironment,
): Response | undefined {
  const { development, mcpEnabled, mcpAllowedOrigins } = parseServerEnvironment(environment);
  if (!mcpEnabled) return new Response("Not found", { status: 404 });
  if (development) return rejectNonLocalRequest(request);

  // Native clients (including Inspector's backend) do not need a browser Origin.
  if (!request.headers.has("origin")) return undefined;
  const callerOrigin = parseOrigin(request.headers.get("origin") ?? "");
  if (!callerOrigin || !mcpAllowedOrigins.includes(callerOrigin)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  return undefined;
}

export async function handleMcpRequest(
  request: Request,
  fetch: (request: Request) => Promise<Response>,
  environment: RuntimeEnvironment = process.env,
): Promise<Response> {
  try {
    return withoutMcpCache(rejectMcpRequest(request, environment) ?? (await fetch(request)));
  } catch (error) {
    logServerError("MCP request failed", error, {
      method: request.method,
      path: new URL(request.url).pathname,
    });
    return withoutMcpCache(
      new Response("MCP request failed. Check the server logs.", { status: 500 }),
    );
  }
}
