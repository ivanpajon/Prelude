import "server-only";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  handleMcpRequest,
  type McpEnvironment,
  rejectMcpRequest,
  rejectNonLocalRequest,
} from "./mcp-access";
import { mcpEndpoint } from "./mcp-endpoint";
import {
  type McpPlaygroundDiscovery,
  McpPlaygroundError,
  type McpPlaygroundExecution,
  type McpPlaygroundResponse,
  type McpPlaygroundTool,
} from "./mcp-playground-types";

const endpointUrl = new URL("http://prelude.internal/api/mcp");

interface PlaygroundOptions {
  endpoint?: { fetch: (request: Request) => Promise<Response> };
  environment?: () => McpEnvironment;
  timeoutMs?: number;
}

function validatePageOrigin(headers: Headers, environment: McpEnvironment) {
  const supplied = headers.get("origin");
  const host = headers.get("host");
  let origin: URL;
  try {
    if (!supplied || !host) throw new Error("Missing origin or host");
    origin = new URL(supplied);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      supplied !== origin.origin ||
      origin.host.toLowerCase() !== host.toLowerCase()
    ) {
      throw new Error("Invalid page origin");
    }
  } catch {
    throw new McpPlaygroundError("errorInvalidOrigin");
  }

  if (
    environment.NODE_ENV === "development" &&
    rejectNonLocalRequest(new Request(endpointUrl, { headers }))
  ) {
    throw new McpPlaygroundError("errorLocalOnly");
  }
}

function nativeHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  // The action verified its browser caller above. MCP now receives a native, in-process
  // client request. Retain identity headers for the shared context, not the action envelope.
  for (const name of [...headers.keys()]) {
    if (
      name.startsWith("mcp-") ||
      name.startsWith("next-") ||
      ["origin", "content-length", "content-type", "accept", "last-event-id"].includes(name)
    ) {
      headers.delete(name);
    }
  }
  return headers;
}

function toolDescriptor(
  tool: Awaited<ReturnType<Client["listTools"]>>["tools"][number],
): McpPlaygroundTool {
  return {
    name: tool.name,
    inputSchema: tool.inputSchema,
    ...(tool.description === undefined ? {} : { description: tool.description }),
    ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
  };
}

/** A request-scoped SDK client; only the endpoint's immutable catalog is shared. */
export function createMcpPlayground({
  endpoint = mcpEndpoint,
  environment = () => process.env,
  timeoutMs = 15_000,
}: PlaygroundOptions = {}) {
  async function withClient<T>(
    incoming: Headers,
    operation: (client: Client, signal: AbortSignal) => Promise<T>,
  ): Promise<McpPlaygroundResponse<T>> {
    let client: Client | undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const config = environment();
      validatePageOrigin(incoming, config);
      const headers = nativeHeaders(incoming);
      const rejection = rejectMcpRequest(new Request(endpointUrl, { headers }), config);
      if (rejection) {
        throw new McpPlaygroundError(
          rejection.status === 404 ? "errorDisabled" : "errorUnavailable",
        );
      }
      client = new Client(
        { name: "prelude-playground", version: "1.0.0" },
        { versionNegotiation: { mode: "auto" } },
      );
      const transport = new StreamableHTTPClientTransport(endpointUrl, {
        fetch: (input, init) => {
          const request = new Request(input, init);
          const protocolHeaders = new Headers(headers);
          for (const [name, value] of request.headers) protocolHeaders.set(name, value);
          return handleMcpRequest(
            new Request(request, { headers: protocolHeaders }),
            (nativeRequest) => endpoint.fetch(nativeRequest),
            environment(),
          );
        },
      });
      await client.connect(transport, { signal: controller.signal, timeout: timeoutMs });
      return { ok: true, ...(await operation(client, controller.signal)) };
    } catch (error) {
      if (error instanceof McpPlaygroundError) return { ok: false, error: error.code };
      if (controller.signal.aborted) {
        return { ok: false, error: "errorTimeout" };
      }
      console.error("MCP playground request failed:", error);
      return { ok: false, error: "errorRequestFailed" };
    } finally {
      clearTimeout(timeout);
      await client?.close().catch(() => undefined);
    }
  }

  return {
    discover(headers: Headers): Promise<McpPlaygroundDiscovery> {
      return withClient(headers, async (client, signal) => {
        // SDK 2.2 walks all pages and rejects a non-converging cursor sequence.
        const { tools } = await client.listTools(undefined, { signal, timeout: timeoutMs });
        return { tools: tools.map(toolDescriptor) };
      });
    },
    execute(
      headers: Headers,
      name: string,
      args: Record<string, unknown>,
    ): Promise<McpPlaygroundExecution> {
      return withClient(headers, async (client, signal) => {
        if (
          typeof name !== "string" ||
          !name ||
          args === null ||
          typeof args !== "object" ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(args))
        ) {
          throw new McpPlaygroundError("errorInvalidToolArguments");
        }
        // Discovery also prepares the SDK's output-schema validation for this client.
        const { tools } = await client.listTools(undefined, { signal, timeout: timeoutMs });
        if (!tools.some((tool) => tool.name === name)) {
          throw new McpPlaygroundError("errorToolUnavailable");
        }
        const result = await client.callTool(
          { name, arguments: args },
          { signal, timeout: timeoutMs },
        );
        return {
          result: {
            content: result.content,
            ...(result.isError === undefined ? {} : { isError: result.isError }),
            ...(result.structuredContent === undefined
              ? {}
              : { structuredContent: result.structuredContent }),
          },
        };
      });
    },
  };
}
