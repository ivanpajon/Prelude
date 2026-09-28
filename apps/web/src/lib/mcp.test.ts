import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { type Context, createDemoRepository, type TaskRepository } from "@repo/api";
import type { Task } from "@repo/contracts";
import { OpenAPIToolGenerator } from "mcp-from-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpEndpoint, generateMcpCatalog, type McpEndpointOptions } from "./mcp";
import { generateOpenApiSpec, handleOpenApiRequest } from "./openapi";

type Endpoint = ReturnType<typeof createMcpEndpoint>;
const endpoints: Endpoint[] = [];
const clients: Client[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const endpoint of endpoints.splice(0)) await endpoint.close();
  vi.restoreAllMocks();
});

function endpoint(options: McpEndpointOptions) {
  const result = createMcpEndpoint(options);
  endpoints.push(result);
  return result;
}

async function connect(
  handler: Endpoint,
  era: "modern" | "legacy" = "modern",
  headers?: Record<string, string>,
) {
  const client = new Client(
    { name: "prelude-test", version: "1.0.0" },
    {
      versionNegotiation: { mode: era === "modern" ? { pin: "2026-07-28" } : "legacy" },
    },
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
      ...(headers === undefined ? {} : { requestInit: { headers } }),
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  return client;
}

function fixtureSpec(paths: Record<string, unknown>) {
  return { openapi: "3.1.0", info: { title: "Fixture", version: "1.0.0" }, paths };
}

function operation(operationId: string, schema: unknown = { type: "object" }) {
  return {
    operationId,
    summary: operationId,
    responses: {
      "200": { description: "Success", content: { "application/json": { schema } } },
    },
  };
}

describe("generated MCP catalog", () => {
  it("generates task schemas and descriptions without mutating the OpenAPI document", async () => {
    const spec = await generateOpenApiSpec();
    const before = structuredClone(spec);
    const catalog = await generateMcpCatalog(spec);

    expect(catalog.map((tool) => tool.name).sort()).toEqual([
      "createTask",
      "listTasks",
      "setTaskCompleted",
    ]);
    expect(catalog.find((tool) => tool.name === "listTasks")).toMatchObject({
      inputSchema: { type: "object", required: ["status"] },
      outputSchema: { type: "array" },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    });
    expect(catalog.find((tool) => tool.name === "setTaskCompleted")).toMatchObject({
      inputSchema: {
        properties: { id: { type: "string" }, completed: { type: "boolean" } },
      },
      outputSchema: {
        type: "object",
        required: expect.arrayContaining(["id", "title", "completed"]),
      },
    });
    expect(spec).toEqual(before);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog[0]?.inputSchema)).toBe(true);
  });

  it("automatically includes new and deprecated operations and honors inherited opt-outs", async () => {
    const spec = fixtureSpec({
      "/hidden": { get: operation("hidden") },
      "/enabled": {
        "x-mcp": true,
        get: { ...operation("enabled"), deprecated: true },
        post: { ...operation("hiddenWrite"), "x-mcp": false },
      },
      "/override": {
        "x-mcp": false,
        get: { ...operation("operationOverride"), "x-mcp": { enabled: true } },
      },
    });
    const tools = await generateMcpCatalog({ ...spec, "x-mcp": false });
    expect(tools.map((tool) => tool.name)).toEqual(["enabled", "operationOverride"]);
  });

  it("retains explicit operation annotation overrides and client-visible metadata", async () => {
    const tools = await generateMcpCatalog(
      fixtureSpec({
        "/new": {
          post: {
            ...operation("newOperation"),
            "x-mcp": {
              annotations: { destructiveHint: false, idempotentHint: true },
              meta: { "example.com/category": "demo" },
            },
          },
        },
      }),
    );
    expect(tools[0]).toMatchObject({
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: { "example.com/category": "demo" },
    });
  });

  it("fails the entire catalog when the generator skips an eligible operation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(OpenAPIToolGenerator.prototype, "generateTool").mockRejectedValueOnce(
      new Error("Unsupported schema"),
    );
    await expect(
      generateMcpCatalog(fixtureSpec({ "/unsupported": { get: operation("unsupported") } })),
    ).rejects.toThrow("MCP generation failed for: get /unsupported");
  });

  it("rejects schemas the generator truncates rather than advertising weaker validation", async () => {
    let schema: unknown = { type: "string", minLength: 1 };
    for (let depth = 0; depth < 15; depth++) {
      schema = { type: "object", properties: { child: schema }, required: ["child"] };
    }
    await expect(
      generateMcpCatalog(fixtureSpec({ "/nested": { get: operation("nested", schema) } })),
    ).rejects.toThrow("MCP schema for nested exceeds the supported nesting depth");
  });

  it("rejects external file references in the generated document", async () => {
    await expect(
      generateMcpCatalog(
        fixtureSpec({
          "/external": {
            get: operation("external", { $ref: "file:///prelude-private-schema.json" }),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe.each(["modern", "legacy"] as const)("MCP %s HTTP compatibility", (era) => {
  it("lists tools and validates natural output through the official client", async () => {
    const networkFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const context: Context = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const dispatch = vi.fn(handleOpenApiRequest);
    const handler = endpoint({ getContext: () => context, dispatch });
    const client = await connect(handler, era);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "createTask",
      "listTasks",
      "setTaskCompleted",
    ]);
    expect(tools.find((tool) => tool.name === "listTasks")?.outputSchema).toMatchObject(
      era === "modern"
        ? { type: "array" }
        : { type: "object", properties: { result: { type: "array" } }, required: ["result"] },
    );

    const title = "x".repeat(120);
    const created = await client.callTool({
      name: "createTask",
      arguments: { title: `  ${title}  ` },
    });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({ title, completed: false });
    const task = created.structuredContent as Task;
    const updated = await client.callTool({
      name: "setTaskCompleted",
      arguments: { id: task.id, completed: true },
    });
    expect(updated.structuredContent).toEqual({ ...task, completed: true });
    const listed = await client.callTool({ name: "listTasks", arguments: { status: "completed" } });
    const expected = [{ ...task, completed: true }];
    expect(listed.structuredContent).toEqual(era === "modern" ? expected : { result: expected });
    expect(listed.content).toContainEqual({ type: "text", text: JSON.stringify(expected) });
    expect(context.onTasksChanged).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([request]) => request.url)).toEqual([
      "http://prelude.internal/api/v1/tasks",
      `http://prelude.internal/api/v1/tasks/${task.id}`,
      "http://prelude.internal/api/v1/tasks?status=completed",
    ]);
    const patch = dispatch.mock.calls[1]?.[0];
    expect(patch?.method).toBe("PATCH");
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs without writes and returns missing-task errors", async () => {
    const context = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const client = await connect(endpoint({ getContext: () => context }), era);
    for (const args of [{}, { title: 42 }, { title: "   " }, { title: "x".repeat(121) }]) {
      const result = await client.callTool({ name: "createTask", arguments: args });
      expect(result.isError).toBe(true);
    }
    const invalidFilter = await client.callTool({
      name: "listTasks",
      arguments: { status: "bad" },
    });
    expect(invalidFilter.isError).toBe(true);
    const missing = await client.callTool({
      name: "setTaskCompleted",
      arguments: { id: "missing", completed: true },
    });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain("NOT_FOUND");
    expect(missing.structuredContent).toBeUndefined();
    expect(context.repository.list("all")).toEqual([]);
    expect(context.onTasksChanged).not.toHaveBeenCalled();
  });

  it("returns safe tool errors for invalid repository output and unexpected failures", async () => {
    const repository: TaskRepository = {
      ...createDemoRepository([]),
      list: () => [{ id: "broken", title: 42, completed: false } as unknown as Task],
      create: () => {
        throw new Error("PRIVATE_DATABASE_PASSWORD");
      },
    };
    const client = await connect(endpoint({ getContext: () => ({ repository }) }), era);
    for (const request of [
      { name: "listTasks", arguments: { status: "all" } },
      { name: "createTask", arguments: { title: "Safe error" } },
    ]) {
      const result = await client.callTool(request);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("PRIVATE_DATABASE_PASSWORD");
      expect(result.content).toEqual([
        {
          type: "text",
          text: JSON.stringify({
            code: "INTERNAL_SERVER_ERROR",
            message: "The API request failed.",
          }),
        },
      ]);
    }
  });

  it("rejects unknown tools and malformed protocol input", async () => {
    const dispatch = vi.fn(handleOpenApiRequest);
    const handler = endpoint({
      getContext: () => ({ repository: createDemoRepository([]) }),
      dispatch,
    });
    const client = await connect(handler, era);
    await expect(client.callTool({ name: "notATool", arguments: {} })).rejects.toThrow();
    const malformed = await handler.fetch(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("MCP endpoint lifecycle", () => {
  it("awaits asynchronous mutation invalidation before returning success", async () => {
    let finishInvalidation: (() => void) | undefined;
    const invalidation = new Promise<void>((resolve) => {
      finishInvalidation = resolve;
    });
    let signalInvalidationStarted: (() => void) | undefined;
    const invalidationStarted = new Promise<void>((resolve) => {
      signalInvalidationStarted = resolve;
    });
    const onTasksChanged = vi.fn(async () => {
      signalInvalidationStarted?.();
      await invalidation;
    });
    const client = await connect(
      endpoint({ getContext: () => ({ repository: createDemoRepository([]), onTasksChanged }) }),
    );
    let returned = false;
    const call = client
      .callTool({ name: "createTask", arguments: { title: "Await invalidation" } })
      .then((result) => {
        returned = true;
        return result;
      });

    await invalidationStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(returned).toBe(false);
    finishInvalidation?.();
    await expect(call).resolves.toMatchObject({
      structuredContent: { title: "Await invalidation" },
    });
    expect(onTasksChanged).toHaveBeenCalledOnce();
  });

  it("validates constraints on newly generated tools, including local references and output", async () => {
    const schema = {
      type: "object",
      properties: { label: { type: "string", minLength: 3, pattern: "^a" } },
      required: ["label"],
    };
    const spec = {
      ...fixtureSpec({
        "/future": {
          post: {
            ...operation("futureOperation", { $ref: "#/components/schemas/Label" }),
            requestBody: {
              required: true,
              content: { "application/json": { schema: { $ref: "#/components/schemas/Label" } } },
            },
          },
        },
      }),
      components: { schemas: { Label: schema } },
    };
    const dispatch = vi.fn(async () => Response.json({ label: "abc" }));
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getSpec: () => spec,
        dispatch,
      }),
    );
    await client.listTools();
    for (const label of ["a", "xyz"]) {
      expect(
        await client.callTool({ name: "futureOperation", arguments: { label } }),
      ).toMatchObject({ isError: true });
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      await client.callTool({ name: "futureOperation", arguments: { label: "abc" } }),
    ).toMatchObject({ structuredContent: { label: "abc" } });
    dispatch.mockResolvedValueOnce(Response.json({ label: "wrong" }));
    expect(
      await client.callTool({ name: "futureOperation", arguments: { label: "abc" } }),
    ).toMatchObject({ isError: true });
  });

  it("does not expose unexpected adapter exceptions", async () => {
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        dispatch: async () => {
          throw new Error("PRIVATE_ADAPTER_DETAILS");
        },
      }),
    );
    const result = await client.callTool({ name: "listTasks", arguments: { status: "all" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ADAPTER_DETAILS");
  });

  it("supports generated operations with no response body", async () => {
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getSpec: () =>
          fixtureSpec({
            "/empty": {
              delete: {
                operationId: "emptyResponse",
                responses: { "204": { description: "Deleted" } },
              },
            },
          }),
        dispatch: async () => new Response(null, { status: 204 }),
      }),
    );
    const result = await client.callTool({ name: "emptyResponse", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeNull();
  });

  it("isolates concurrent request contexts while sharing only immutable tool definitions", async () => {
    const first = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const second = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const getSpec = vi.fn(generateOpenApiSpec);
    const getContext = vi.fn((request: Request) =>
      request.headers.get("x-test-context") === "first" ? first : second,
    );
    const handler = endpoint({ getContext, getSpec });
    const [firstClient, secondClient] = await Promise.all([
      connect(handler, "modern", { "x-test-context": "first" }),
      connect(handler, "modern", { "x-test-context": "second" }),
    ]);
    await Promise.all([
      firstClient.callTool({ name: "createTask", arguments: { title: "First context" } }),
      secondClient.callTool({ name: "createTask", arguments: { title: "Second context" } }),
    ]);
    expect(first.repository.list("all").map((task) => task.title)).toEqual(["First context"]);
    expect(second.repository.list("all").map((task) => task.title)).toEqual(["Second context"]);
    expect(first.onTasksChanged).toHaveBeenCalledOnce();
    expect(second.onTasksChanged).toHaveBeenCalledOnce();
    expect(getSpec).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledTimes(4);
  });

  it("retries failed specification generation instead of caching a failed catalog", async () => {
    const getSpec = vi
      .fn(generateOpenApiSpec)
      .mockRejectedValueOnce(new Error("Temporary failure"));
    const handler = endpoint({
      getContext: () => ({ repository: createDemoRepository([]) }),
      getSpec,
    });
    await expect(connect(handler)).rejects.toThrow();
    const client = await connect(handler);
    await expect(client.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
    expect(getSpec).toHaveBeenCalledTimes(2);
  });

  it("returns 405 for legacy session GET and DELETE without creating request context", async () => {
    const getContext = vi.fn(() => ({ repository: createDemoRepository([]) }));
    const handler = endpoint({ getContext });
    for (const method of ["GET", "DELETE"]) {
      const response = await handler.fetch(new Request("http://localhost/api/mcp", { method }));
      expect(response.status).toBe(405);
    }
    expect(getContext).not.toHaveBeenCalled();
  });
});
