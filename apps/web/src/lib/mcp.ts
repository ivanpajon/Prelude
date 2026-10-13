import "server-only";

import {
  type CallToolResult,
  createMcpHandler,
  fromJsonSchema,
  type JSONValue,
  type JsonSchemaType,
  type McpHttpHandler,
  McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import {
  buildHttpRequest,
  type JsonSchema,
  type McpOpenAPITool,
  OpenAPIToolGenerator,
} from "mcp-from-openapi";
import { site } from "@/site";
import { logServerError } from "./server-log";
// demo:start

import { createMcpAppHtmlLoader, type McpAppHtmlLoader, registerTaskApp } from "./mcp-app-resource";

// demo:end

// Requests are dispatched in process. This origin is never contacted over the network.
const apiBaseUrl = "http://prelude.internal/api";
const truncationMarker = "[Truncated: nested schema exceeds maxSchemaDepth]";

function compileSchema<T = unknown>(schema: JsonSchema) {
  // The SDK types $vocabulary values as strings; the generator correctly uses booleans.
  // Keep the JSON unchanged at this type boundary. The SDK compiles it with AJV.
  return fromJsonSchema<T>(schema as unknown as JsonSchemaType);
}

function freezeCatalog<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) freezeCatalog(child, visited);
  return Object.freeze(value);
}

function assertSupportedSchema(value: unknown, toolName: string, visited = new WeakSet<object>()) {
  if (value === null || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "description" && typeof child === "string" && child.includes(truncationMarker)) {
      throw new Error(`MCP schema for ${toolName} exceeds the supported nesting depth.`);
    }
    if (key === "$ref" && typeof child === "string" && !child.startsWith("#")) {
      throw new Error(`MCP schema for ${toolName} contains an external reference.`);
    }
    assertSupportedSchema(child, toolName, visited);
  }
}

/** Generate one complete catalog from the same document served by the public API. */
export async function generateMcpCatalog(spec: object): Promise<readonly McpOpenAPITool[]> {
  // Disabled resolvers can leave external references unresolved instead of throwing.
  assertSupportedSchema(spec, "the OpenAPI document");
  const generator = await OpenAPIToolGenerator.fromJSON(structuredClone(spec), {
    secureDefaults: true,
  });
  const expected = new Set<string>();
  const tools = await generator.generateTools({
    includeDeprecated: true,
    includeAllResponses: false,
    descriptionStrategy: "combined",
    // This callback runs after the generator's own x-mcp and other eligibility checks.
    filterFn: ({ method, path }) => {
      expected.add(`${method.toLowerCase()} ${path}`);
      return true;
    },
  });
  for (const tool of tools) {
    expected.delete(`${tool.metadata.method.toLowerCase()} ${tool.metadata.path}`);
    assertSupportedSchema(tool.inputSchema, tool.name);
    assertSupportedSchema(tool.outputSchema, tool.name);
    // Compile before caching, so invalid schemas fail the whole catalog and can be retried.
    compileSchema(tool.inputSchema);
    if (tool.outputSchema !== undefined) compileSchema(tool.outputSchema);
  }
  // The generator warns and skips individual failures; never publish a partial catalog.
  if (expected.size > 0) {
    throw new Error(`MCP generation failed for: ${[...expected].join(", ")}.`);
  }
  return freezeCatalog(tools);
}

export interface McpEndpointOptions<TContext> {
  getContext: (request: Request) => TContext | Promise<TContext>;
  /** Returns the OpenAPI document that the tools are generated from. */
  getSpec: () => object | Promise<object>;
  /** Sends a tool call's HTTP request to the API handler, in process. */
  dispatch: (request: Request, context: TContext) => Promise<Response>;
  // demo:start
  getAppHtml?: McpAppHtmlLoader;
  // demo:end
}

function toolError(message: string, code = "INTERNAL_SERVER_ERROR"): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ code, message }) }] };
}

async function executeTool<TContext>(
  tool: McpOpenAPITool,
  input: Record<string, unknown>,
  context: TContext,
  signal: AbortSignal,
  dispatch: McpEndpointOptions<TContext>["dispatch"],
): Promise<CallToolResult> {
  try {
    const mapped = buildHttpRequest(tool, input, { baseUrl: apiBaseUrl });
    const response = await dispatch(
      new Request(mapped.url, {
        method: mapped.method,
        headers: mapped.headers,
        ...(mapped.body === undefined ? {} : { body: mapped.body as BodyInit }),
        signal,
      }),
      context,
    );
    if (!response.ok) {
      // The API handler has already logged the cause of a 5xx response.
      if (response.status >= 500) return toolError("The API request failed.");
      const error: unknown = await response.json();
      if (error !== null && typeof error === "object" && "message" in error) {
        const code = "code" in error && typeof error.code === "string" ? error.code : "API_ERROR";
        if (typeof error.message === "string") return toolError(error.message, code);
      }
      return toolError("The API rejected the request.", "API_ERROR");
    }
    // Empty bodies (204, HEAD, or a procedure without output) become null.
    const text = await response.text();
    const data: JSONValue = text ? JSON.parse(text) : null;
    // SDK v2 preserves natural JSON for modern clients and projects arrays for legacy clients.
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  } catch (error) {
    // Unexpected adapter errors must not expose causes, stacks, or secrets to the client.
    if (!signal.aborted) logServerError("MCP tool call failed", error, { tool: tool.name });
    return toolError("The API request failed.");
  }
}

function toolConfig(tool: McpOpenAPITool) {
  return {
    description: tool.description,
    inputSchema: compileSchema<Record<string, unknown>>(tool.inputSchema),
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: compileSchema<JSONValue>(tool.outputSchema) }),
    ...(tool.title === undefined ? {} : { title: tool.title }),
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
    ...(tool.icons === undefined ? {} : { icons: tool.icons }),
    ...(tool._meta === undefined ? {} : { _meta: tool._meta }),
  };
}

export type McpToolConfig = ReturnType<typeof toolConfig>;
export type McpToolCallback = (
  input: Record<string, unknown>,
  serverContext: ServerContext,
) => Promise<CallToolResult>;

/** The catalog is shared; each HTTP request receives a fresh server and application context. */
export function createMcpEndpoint<TContext>({
  getContext,
  getSpec,
  dispatch,
  // demo:start
  getAppHtml = createMcpAppHtmlLoader(),
  // demo:end
}: McpEndpointOptions<TContext>): McpHttpHandler {
  let catalog: Promise<readonly McpOpenAPITool[]> | undefined;
  const getCatalog = () => {
    catalog ??= Promise.resolve()
      .then(getSpec)
      .then(generateMcpCatalog)
      .catch((error: unknown) => {
        catalog = undefined;
        throw error;
      });
    return catalog;
  };

  return createMcpHandler(async ({ requestInfo }) => {
    if (!requestInfo) throw new Error("MCP requires an HTTP request.");
    const tools = await getCatalog();
    const context = await getContext(requestInfo);
    const server = new McpServer({ name: site.slug, version: "1.0.0" });
    // demo:start
    const registerAppTool = registerTaskApp(server, tools, getAppHtml);
    // demo:end
    for (const tool of tools) {
      const config = toolConfig(tool);
      const execute: McpToolCallback = (input, { mcpReq }) =>
        executeTool(tool, input, context, mcpReq.signal, dispatch);
      // demo:start
      if (registerAppTool?.(tool, config, execute)) continue;
      // demo:end
      server.registerTool(tool.name, config, execute);
    }
    return server;
  });
}
