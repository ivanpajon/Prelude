import "server-only";

import { RESOURCE_URI_META_KEY, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
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
import type { Context } from "@repo/api";
import {
  buildHttpRequest,
  type JsonSchema,
  type McpOpenAPITool,
  OpenAPIToolGenerator,
} from "mcp-from-openapi";
import {
  createMcpAppHtmlLoader,
  getTaskAppTools,
  type McpAppHtmlLoader,
  mcpAppResourceUri,
  registerTaskAppResource,
} from "./mcp-app-resource";
import { generateOpenApiSpec, handleOpenApiRequest } from "./openapi";

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

export interface McpEndpointOptions {
  getContext: (request: Request) => Context | Promise<Context>;
  getSpec?: () => object | Promise<object>;
  dispatch?: (request: Request, context: Context) => Promise<Response>;
  getAppHtml?: McpAppHtmlLoader;
}

function toolError(message: string, code = "INTERNAL_SERVER_ERROR"): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ code, message }) }] };
}

async function executeTool(
  tool: McpOpenAPITool,
  input: Record<string, unknown>,
  context: Context,
  signal: AbortSignal,
  dispatch: NonNullable<McpEndpointOptions["dispatch"]>,
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
      if (response.status >= 500) return toolError("The API request failed.");
      const error: unknown = await response.json();
      if (error !== null && typeof error === "object" && "message" in error) {
        const code = "code" in error && typeof error.code === "string" ? error.code : "API_ERROR";
        if (typeof error.message === "string") return toolError(error.message, code);
      }
      return toolError("The API rejected the request.", "API_ERROR");
    }
    // The generator represents a documented empty response with a null output schema.
    const data: JSONValue =
      response.status === 204 || mapped.method === "HEAD" ? null : await response.json();
    // SDK v2 preserves natural JSON for modern clients and projects arrays for legacy clients.
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  } catch {
    // Unexpected repository/adapter errors must not expose causes, stacks, or secrets.
    return toolError("The API request failed.");
  }
}

/** The catalog is shared; each HTTP request receives a fresh server and application context. */
export function createMcpEndpoint({
  getContext,
  getSpec = generateOpenApiSpec,
  dispatch = handleOpenApiRequest,
  getAppHtml = createMcpAppHtmlLoader(),
}: McpEndpointOptions): McpHttpHandler {
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
    const server = new McpServer({ name: "prelude", version: "1.0.0" });
    const appTools = getTaskAppTools(tools);
    if (appTools) registerTaskAppResource(server, appTools, getAppHtml);
    for (const tool of tools) {
      const config = {
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
      const execute = (input: Record<string, unknown>, { mcpReq }: ServerContext) =>
        executeTool(tool, input, context, mcpReq.signal, dispatch);
      if (appTools && tool.metadata.operationId === "listTasks") {
        const existingUi = tool._meta?.ui;
        registerAppTool(
          server,
          tool.name,
          {
            ...config,
            _meta: {
              ...tool._meta,
              [RESOURCE_URI_META_KEY]: mcpAppResourceUri,
              ui: {
                ...(existingUi !== null && typeof existingUi === "object" ? existingUi : {}),
                resourceUri: mcpAppResourceUri,
              },
            },
          },
          execute,
        );
      } else {
        server.registerTool(tool.name, config, execute);
      }
    }
    return server;
  });
}
