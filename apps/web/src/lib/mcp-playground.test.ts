import { Client } from "@modelcontextprotocol/client";
import { type Context, createDemoRepository, type TaskRepository } from "@repo/api";
import type { Task } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpEndpoint } from "./mcp";
import { handleMcpRequest, type McpEnvironment } from "./mcp-access";
import { createMcpPlayground } from "./mcp-playground";
import { handleOpenApiRequest } from "./openapi";

const endpoints: ReturnType<typeof createMcpEndpoint>[] = [];

afterEach(async () => {
  for (const endpoint of endpoints.splice(0)) await endpoint.close();
  vi.restoreAllMocks();
});

function pageHeaders(overrides: Record<string, string> = {}) {
  return new Headers({ host: "localhost:3000", origin: "http://localhost:3000", ...overrides });
}

function fixture(
  context: Context = { repository: createDemoRepository([]) },
  environment: McpEnvironment = { NODE_ENV: "production" },
) {
  const contexts: Request[] = [];
  const endpoint = createMcpEndpoint({
    getContext: (request) => {
      contexts.push(request);
      return context;
    },
  });
  endpoints.push(endpoint);
  return {
    context,
    contexts,
    endpoint,
    playground: createMcpPlayground({ endpoint, environment: () => environment }),
  };
}

describe("homepage MCP access", () => {
  it.each([
    { origin: "https://foreign.example" },
    { origin: "null" },
    { origin: "http://localhost:3000/path" },
    { origin: "http://localhost:3000/" },
    { origin: "http://user:pass@localhost:3000" },
    { origin: "http://localhost:3001" },
    { origin: "" },
    { host: "foreign.example", "x-forwarded-host": "localhost:3000" },
  ])("rejects invalid page origins before discovery: %j", async (overrides) => {
    const endpoint = { fetch: vi.fn() };
    const playground = createMcpPlayground({
      endpoint,
      environment: () => ({ NODE_ENV: "production" }),
    });
    expect(await playground.discover(pageHeaders(overrides))).toMatchObject({ ok: false });
    expect(endpoint.fetch).not.toHaveBeenCalled();
  });

  it("rejects missing origin or host and nonlocal development requests", async () => {
    const endpoint = { fetch: vi.fn() };
    const playground = createMcpPlayground({
      endpoint,
      environment: () => ({ NODE_ENV: "development" }),
    });
    for (const name of ["origin", "host"]) {
      const headers = pageHeaders();
      headers.delete(name);
      expect(await playground.discover(headers)).toMatchObject({ ok: false });
    }
    expect(
      await playground.discover(
        pageHeaders({ host: "prelude.example", origin: "https://prelude.example" }),
      ),
    ).toEqual({
      ok: false,
      error: "The development playground is available on localhost only.",
    });
    expect(endpoint.fetch).not.toHaveBeenCalled();
  });

  it("enforces runtime disabling before accessing the endpoint", async () => {
    const environment: McpEnvironment = { NODE_ENV: "production", MCP_ENABLED: "false" };
    const endpoint = { fetch: vi.fn() };
    const playground = createMcpPlayground({ endpoint, environment: () => environment });
    expect(await playground.discover(pageHeaders())).toEqual({
      ok: false,
      error: "MCP is disabled for this application.",
    });
    expect(await playground.execute(pageHeaders(), "createTask", { title: "Disabled" })).toEqual({
      ok: false,
      error: "MCP is disabled for this application.",
    });
    expect(endpoint.fetch).not.toHaveBeenCalled();
  });

  it("works in production without opening the public endpoint to browser origins", async () => {
    const { playground, endpoint } = fixture();
    const headers = pageHeaders({ host: "prelude.example", origin: "https://prelude.example" });
    expect(await playground.discover(headers)).toMatchObject({ ok: true });
    const response = await handleMcpRequest(
      new Request("https://prelude.example/api/mcp", { headers }),
      (request) => endpoint.fetch(request),
      { NODE_ENV: "production" },
    );
    expect(response.status).toBe(403);
  });

  it("supports valid loopback development access", async () => {
    const { playground } = fixture(undefined, { NODE_ENV: "development" });
    expect(await playground.discover(pageHeaders())).toMatchObject({ ok: true });
  });
});

describe("homepage MCP protocol client", () => {
  it("discovers schemas, performs real tools, and retains request identity without networking", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network"));
    const closed = vi.spyOn(Client.prototype, "close");
    const context = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const { playground, contexts } = fixture(context);
    const headers = pageHeaders({
      cookie: "session=example",
      authorization: "Bearer example",
      "mcp-session-id": "untrusted-session",
      "mcp-protocol-version": "untrusted-version",
      "mcp-param-title": "untrusted-title",
      "next-action": "browser-action",
      "last-event-id": "untrusted-event",
    });
    const discovered = await playground.discover(headers);
    expect(discovered).toMatchObject({
      ok: true,
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "listTasks",
          outputSchema: expect.objectContaining({ type: "array", items: expect.any(Object) }),
        }),
        expect.objectContaining({ name: "createTask", inputSchema: expect.any(Object) }),
        expect.objectContaining({
          name: "deleteTask",
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({ destructiveHint: true }),
        }),
      ]),
    });
    const created = await playground.execute(headers, "createTask", { title: "  From MCP  " });
    expect(created).toMatchObject({
      ok: true,
      result: { structuredContent: { title: "From MCP", completed: false } },
    });
    if (!created.ok) throw new Error("Expected success");
    const task = created.result.structuredContent as Task;
    const updated = await playground.execute(headers, "setTaskCompleted", {
      id: task.id,
      completed: true,
    });
    expect(updated).toMatchObject({
      ok: true,
      result: { structuredContent: { ...task, completed: true } },
    });
    expect(await playground.execute(headers, "listTasks", { status: "completed" })).toMatchObject({
      ok: true,
      result: { structuredContent: [{ ...task, completed: true }] },
    });
    expect(await playground.execute(headers, "deleteTask", { id: task.id })).toMatchObject({
      ok: true,
      result: { structuredContent: { ...task, completed: true } },
    });
    expect(await playground.execute(headers, "listTasks", { status: "all" })).toMatchObject({
      ok: true,
      result: { structuredContent: [] },
    });
    expect(context.onTasksChanged).toHaveBeenCalledTimes(3);
    expect(closed).toHaveBeenCalledTimes(6);
    expect(contexts.length).toBeGreaterThan(4);
    for (const request of contexts) {
      expect(request.headers.get("cookie")).toBe("session=example");
      expect(request.headers.get("authorization")).toBe("Bearer example");
      expect(request.headers.get("host")).toBe("localhost:3000");
      expect(request.headers.has("origin")).toBe(false);
      expect(request.headers.has("mcp-session-id")).toBe(false);
      expect(request.headers.has("mcp-param-title")).toBe(false);
      expect(request.headers.has("next-action")).toBe(false);
      expect(request.headers.has("last-event-id")).toBe(false);
      expect(request.headers.get("mcp-protocol-version")).not.toBe("untrusted-version");
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("uses the SDK's complete paginated discovery", async () => {
    const { endpoint } = fixture();
    const cursors: unknown[] = [];
    const paginated = {
      async fetch(request: Request) {
        const body = await request.clone().json();
        const response = await endpoint.fetch(request);
        if (body.method !== "tools/list") return response;
        cursors.push(body.params?.cursor);
        const payload = await response.json();
        const all = payload.result.tools;
        payload.result = body.params?.cursor
          ? { ...payload.result, tools: all.slice(1) }
          : { ...payload.result, tools: all.slice(0, 1), nextCursor: "second" };
        return Response.json(payload, { headers: response.headers });
      },
    };
    const playground = createMcpPlayground({ endpoint: paginated, environment: () => ({}) });
    expect(await playground.discover(pageHeaders())).toMatchObject({
      ok: true,
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "listTasks" }),
        expect.objectContaining({ name: "createTask" }),
        expect.objectContaining({ name: "setTaskCompleted" }),
        expect.objectContaining({ name: "deleteTask" }),
      ]),
    });
    expect(cursors).toEqual([undefined, "second"]);
  });

  it("returns validation and missing-task results without writes", async () => {
    const { playground, context } = fixture();
    for (const [name, args] of [
      ["createTask", { title: "   " }],
      ["listTasks", { status: "invalid" }],
      ["setTaskCompleted", { id: "missing", completed: true }],
      ["deleteTask", { id: "missing" }],
      ["deleteTask", { id: "" }],
    ] as const) {
      expect(await playground.execute(pageHeaders(), name, args)).toMatchObject({
        ok: true,
        result: { isError: true },
      });
    }
    expect(context.repository.list("all")).toEqual([]);
    expect(await playground.execute(pageHeaders(), "unknown", {})).toEqual({
      ok: false,
      error: "This tool is unavailable. Discover tools again.",
    });
    for (const args of [null, [], "not an object"]) {
      expect(
        await playground.execute(
          pageHeaders(),
          "createTask",
          args as unknown as Record<string, unknown>,
        ),
      ).toMatchObject({ ok: false });
    }
  });

  it("keeps invalid outputs and internal errors out of successful results", async () => {
    const repository: TaskRepository = {
      ...createDemoRepository([]),
      list: () => [{ id: "broken", title: 42, completed: false } as unknown as Task],
      create: () => {
        throw new Error("PRIVATE_DATABASE_DETAILS");
      },
    };
    const { playground } = fixture({ repository });
    for (const [name, args] of [
      ["listTasks", { status: "all" }],
      ["createTask", { title: "Example" }],
    ] as const) {
      const result = await playground.execute(pageHeaders(), name, args);
      expect(result).toMatchObject({ ok: true, result: { isError: true } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_DATABASE_DETAILS");
    }
  });

  it("isolates concurrent callers and awaits mutation callbacks", async () => {
    const first = {
      repository: createDemoRepository([]),
      onTasksChanged: vi.fn(async () => {
        await Promise.resolve();
      }),
    };
    const second = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const endpoint = createMcpEndpoint({
      getContext: (request) => (request.headers.get("authorization") === "first" ? first : second),
    });
    endpoints.push(endpoint);
    const playground = createMcpPlayground({ endpoint, environment: () => ({}) });
    await Promise.all([
      playground.execute(pageHeaders({ authorization: "first" }), "createTask", { title: "First" }),
      playground.execute(pageHeaders({ authorization: "second" }), "createTask", {
        title: "Second",
      }),
    ]);
    expect(first.repository.list("all").map((task) => task.title)).toEqual(["First"]);
    expect(second.repository.list("all").map((task) => task.title)).toEqual(["Second"]);
    expect(first.onTasksChanged).toHaveBeenCalledOnce();
    expect(second.onTasksChanged).toHaveBeenCalledOnce();
    const response = await handleOpenApiRequest(
      new Request("http://prelude.internal/api/v1/tasks?status=all"),
      first,
    );
    expect(await response.json()).toMatchObject([{ title: "First" }]);
  });

  it("closes clients after protocol failures and redacts internal diagnostics", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const closed = vi.spyOn(Client.prototype, "close");
    const playground = createMcpPlayground({
      endpoint: {
        fetch: async () => {
          throw new Error("PRIVATE_HANDLER_DETAILS");
        },
      },
      environment: () => ({}),
    });
    const result = await playground.discover(pageHeaders());
    expect(result).toEqual({ ok: false, error: "Could not complete the MCP request. Try again." });
    expect(closed).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_HANDLER_DETAILS");
  });

  it("times out a pending request and closes its client", async () => {
    const { endpoint } = fixture();
    const closed = vi.spyOn(Client.prototype, "close");
    const playground = createMcpPlayground({
      endpoint: {
        async fetch(request) {
          const body = await request.clone().json();
          if (body.method !== "tools/list") return endpoint.fetch(request);
          return new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener("abort", () => reject(request.signal.reason), {
              once: true,
            });
          });
        },
      },
      environment: () => ({}),
      timeoutMs: 100,
    });
    expect(await playground.discover(pageHeaders())).toEqual({
      ok: false,
      error: "MCP took too long to respond. Try again.",
    });
    expect(closed).toHaveBeenCalled();
  });
});
