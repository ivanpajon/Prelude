import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { type Context, createDemoRepository, type TaskRepository } from "@repo/api";
import type { Task } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { site } from "@/site";
import { createMcpEndpoint, generateMcpCatalog, type McpEndpointOptions } from "./mcp";
import { mcpAppResourceUri } from "./mcp-app-resource";
import { generateOpenApiSpec, handleOpenApiRequest } from "./openapi";

type Endpoint = ReturnType<typeof createMcpEndpoint>;
const endpoints: Endpoint[] = [];
const clients: Client[] = [];

const expectedTaskAnnotations = {
  listTasks: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  createTask: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  setTaskCompleted: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  updateTaskTitle: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  deleteTask: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};
const taskToolNames = Object.keys(expectedTaskAnnotations);

/** Keep only the task tools, so procedures added next to the demo do not fail these tests. */
function taskTools<T extends { name: string }>(tools: readonly T[]) {
  return tools.filter((tool) => taskToolNames.includes(tool.name));
}

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const endpoint of endpoints.splice(0)) await endpoint.close();
  vi.restoreAllMocks();
});

type TaskEndpointOptions = Pick<McpEndpointOptions<Context>, "getContext"> &
  Partial<McpEndpointOptions<Context>>;

function endpoint(options: TaskEndpointOptions) {
  const result = createMcpEndpoint({
    getSpec: generateOpenApiSpec,
    dispatch: handleOpenApiRequest,
    ...options,
  });
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

describe("generated task MCP catalog", () => {
  it("generates task schemas and descriptions without mutating the OpenAPI document", async () => {
    const spec = await generateOpenApiSpec();
    const before = structuredClone(spec);
    const catalog = await generateMcpCatalog(spec);

    // Require explicit contract hints, independent of the generator's HTTP-method defaults.
    // Only the task paths count; other features may sit next to the demo.
    const operations = Object.entries(spec.paths ?? {})
      .filter(([path]) => path === "/v1/tasks" || path.startsWith("/v1/tasks/"))
      .flatMap(([, path]) =>
        [path?.get, path?.post, path?.patch, path?.delete].filter(
          (operation) => operation !== undefined,
        ),
      );
    expect(
      Object.fromEntries(
        operations.map((operation) => [
          operation.operationId,
          "x-mcp" in operation ? operation["x-mcp"] : undefined,
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(expectedTaskAnnotations).map(([name, annotations]) => [
          name,
          { annotations },
        ]),
      ),
    );
    expect(
      Object.fromEntries(taskTools(catalog).map((tool) => [tool.name, tool.annotations])),
    ).toEqual(expectedTaskAnnotations);
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
    expect(catalog.find((tool) => tool.name === "deleteTask")).toMatchObject({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } },
        required: ["id"],
      },
      outputSchema: {
        type: "object",
        required: expect.arrayContaining(["id", "title", "completed"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      metadata: { operationId: "deleteTask", method: "delete", path: "/v1/tasks/{id}" },
      description: expect.stringContaining("NOT_FOUND"),
    });
    // Only the descriptions state the normalized title limit; input schemas omit it on purpose.
    expect(catalog.find((tool) => tool.name === "createTask")?.description).toContain(
      "1–120 characters",
    );
    expect(catalog.find((tool) => tool.name === "updateTaskTitle")).toMatchObject({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 }, title: { type: "string" } },
        required: expect.arrayContaining(["id", "title"]),
      },
      outputSchema: {
        type: "object",
        properties: { title: { type: "string", minLength: 1, maxLength: 120 } },
        required: expect.arrayContaining(["id", "title", "completed"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
      metadata: { operationId: "updateTaskTitle", method: "patch", path: "/v1/tasks/{id}/title" },
      description: expect.stringMatching(/1–120 characters[\s\S]*NOT_FOUND/),
    });
    expect(spec).toEqual(before);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog[0]?.inputSchema)).toBe(true);
  });
});

describe.each(["modern", "legacy"] as const)("MCP %s task tools", (era) => {
  it("lists tools and validates natural output through the official client", async () => {
    const networkFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const context: Context = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const dispatch = vi.fn(async (request: Request, requestContext: Context) => {
      if (new URL(request.url).pathname.endsWith("/title")) {
        expect(await request.clone().json()).toEqual({ title: "  Edited task  " });
      }
      return handleOpenApiRequest(request, requestContext);
    });
    const handler = endpoint({ getContext: () => context, dispatch });
    const client = await connect(handler, era);
    expect(client.getServerVersion()?.name).toBe(site.slug);
    const { tools } = await client.listTools();
    expect(
      Object.fromEntries(taskTools(tools).map((tool) => [tool.name, tool.annotations])),
    ).toEqual(expectedTaskAnnotations);
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
    const edited = await client.callTool({
      name: "updateTaskTitle",
      arguments: { id: task.id, title: "  Edited task  " },
    });
    const editedTask = { ...task, title: "Edited task", completed: true };
    expect(edited.isError).not.toBe(true);
    expect(edited.structuredContent).toEqual(editedTask);
    expect(edited.content).toContainEqual({ type: "text", text: JSON.stringify(editedTask) });
    const listed = await client.callTool({ name: "listTasks", arguments: { status: "completed" } });
    const expected = [editedTask];
    expect(listed.structuredContent).toEqual(era === "modern" ? expected : { result: expected });
    expect(listed.content).toContainEqual({ type: "text", text: JSON.stringify(expected) });
    const deleted = await client.callTool({ name: "deleteTask", arguments: { id: task.id } });
    expect(deleted.isError).not.toBe(true);
    expect(deleted.structuredContent).toEqual(editedTask);
    expect(context.repository.list("all")).toEqual([]);
    const repeated = await client.callTool({ name: "deleteTask", arguments: { id: task.id } });
    expect(repeated.isError).toBe(true);
    expect(JSON.stringify(repeated.content)).toContain("NOT_FOUND");
    expect(context.onTasksChanged).toHaveBeenCalledTimes(4);
    expect(dispatch.mock.calls.map(([request]) => request.url)).toEqual([
      "http://prelude.internal/api/v1/tasks",
      `http://prelude.internal/api/v1/tasks/${task.id}`,
      `http://prelude.internal/api/v1/tasks/${task.id}/title`,
      "http://prelude.internal/api/v1/tasks?status=completed",
      `http://prelude.internal/api/v1/tasks/${task.id}`,
      `http://prelude.internal/api/v1/tasks/${task.id}`,
    ]);
    const patch = dispatch.mock.calls[1]?.[0];
    expect(patch?.method).toBe("PATCH");
    const titlePatch = dispatch.mock.calls[2]?.[0];
    expect(titlePatch?.method).toBe("PATCH");
    const deletion = dispatch.mock.calls[4]?.[0];
    expect(deletion?.method).toBe("DELETE");
    expect(deletion?.body).toBeNull();
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
    for (const args of [{}, { id: "" }, { id: 42 }, { id: "missing" }]) {
      const deleted = await client.callTool({ name: "deleteTask", arguments: args });
      expect(deleted.isError).toBe(true);
      expect(deleted.structuredContent).toBeUndefined();
      if (args.id === "missing") expect(JSON.stringify(deleted.content)).toContain("NOT_FOUND");
    }
    for (const args of [
      {},
      { id: "missing", title: "Valid title" },
      { id: "missing", title: "   " },
      { id: "missing", title: "x".repeat(121) },
      { id: "missing", title: 42 },
      { id: "", title: "Valid title" },
      { id: 42, title: "Valid title" },
    ]) {
      const edited = await client.callTool({ name: "updateTaskTitle", arguments: args });
      expect(edited.isError).toBe(true);
      expect(edited.structuredContent).toBeUndefined();
      if (args.id === "missing" && args.title === "Valid title") {
        expect(JSON.stringify(edited.content)).toContain("NOT_FOUND");
      }
    }
    expect(context.repository.list("all")).toEqual([]);
    expect(context.onTasksChanged).not.toHaveBeenCalled();
  });

  it("returns safe tool errors for invalid repository output and unexpected failures", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: TaskRepository = {
      ...createDemoRepository([]),
      list: () => [{ id: "broken", title: 42, completed: false } as unknown as Task],
      create: () => {
        throw new Error("PRIVATE_DATABASE_PASSWORD");
      },
      delete: () => ({ id: "broken", title: 42, completed: false }) as unknown as Task,
      updateTitle: () => ({ id: "broken", title: 42, completed: false }) as unknown as Task,
    };
    const client = await connect(endpoint({ getContext: () => ({ repository }) }), era);
    for (const request of [
      { name: "listTasks", arguments: { status: "all" } },
      { name: "createTask", arguments: { title: "Safe error" } },
      { name: "deleteTask", arguments: { id: "broken" } },
      { name: "updateTaskTitle", arguments: { id: "broken", title: "Edited" } },
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
    // One server-side entry per failed call; the cause stays in the log, not the result.
    expect(logged).toHaveBeenCalledTimes(4);
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

describe.each(["modern", "legacy"] as const)("MCP %s App resources", (era) => {
  const appHtml =
    "<!doctype html><html><head><!--PRELUDE_MCP_APP_CONFIG--></head><body>Task widget</body></html>";

  it("associates only listTasks and serves a lazy resource with a restrictive CSP", async () => {
    const getAppHtml = vi.fn(() => appHtml);
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getAppHtml,
      }),
      era,
    );
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(taskToolNames));
    expect(tools.find((tool) => tool.name === "listTasks")).toMatchObject({
      _meta: {
        ui: { resourceUri: mcpAppResourceUri },
        "ui/resourceUri": mcpAppResourceUri,
      },
    });
    for (const tool of tools.filter((entry) => entry.name !== "listTasks")) {
      expect(tool._meta?.ui).toBeUndefined();
    }
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      name: `${site.name} task workspace`,
      uri: mcpAppResourceUri,
      mimeType: "text/html;profile=mcp-app",
    });
    expect(getAppHtml).not.toHaveBeenCalled();
    const { contents } = await client.readResource({ uri: mcpAppResourceUri });
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({
      uri: mcpAppResourceUri,
      mimeType: "text/html;profile=mcp-app",
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } },
    });
    expect(contents[0]?._meta).toEqual(resources[0]?._meta);
    const result = contents[0];
    expect(result && "text" in result ? result.text : "").toContain(
      JSON.stringify({
        tools: {
          listTasks: "listTasks",
          createTask: "createTask",
          setTaskCompleted: "setTaskCompleted",
          updateTaskTitle: "updateTaskTitle",
          deleteTask: "deleteTask",
        },
      }),
    );
    expect(getAppHtml).toHaveBeenCalledOnce();
    await expect(client.readResource({ uri: "ui://prelude/missing.html" })).rejects.toThrow();
    expect(getAppHtml).toHaveBeenCalledOnce();
  });

  it("follows operation IDs through renames and preserves unrelated metadata and annotations", async () => {
    const spec = fixtureSpec({
      "/tasks": {
        get: {
          ...operation("listTasks", { type: "array", items: { type: "string" } }),
          "x-mcp": {
            name: "renamedList",
            annotations: { readOnlyHint: true, idempotentHint: false },
            meta: {
              "example.com/category": "tasks",
              "ui/resourceUri": "ui://old/resource.html",
              ui: { resourceUri: "ui://old/resource.html", visibility: ["model", "app"] },
            },
          },
        },
        post: { ...operation("createTask"), "x-mcp": { name: "renamedCreate" } },
      },
      "/tasks/completion": {
        patch: { ...operation("setTaskCompleted"), "x-mcp": { name: "renamedCompletion" } },
        delete: { ...operation("deleteTask"), "x-mcp": { name: "renamedDelete" } },
      },
      "/tasks/title": {
        patch: { ...operation("updateTaskTitle"), "x-mcp": { name: "renamedTitle" } },
      },
    });
    const before = structuredClone(spec);
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getSpec: () => spec,
        getAppHtml: () => appHtml,
        dispatch: async () => Response.json(["unchanged output"]),
      }),
      era,
    );
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "renamedList")).toMatchObject({
      annotations: { readOnlyHint: true, idempotentHint: false },
      _meta: {
        "example.com/category": "tasks",
        "ui/resourceUri": mcpAppResourceUri,
        ui: { resourceUri: mcpAppResourceUri, visibility: ["model", "app"] },
      },
    });
    const { contents } = await client.readResource({ uri: mcpAppResourceUri });
    expect(contents[0] && "text" in contents[0] ? contents[0].text : "").toContain(
      JSON.stringify({
        tools: {
          listTasks: "renamedList",
          createTask: "renamedCreate",
          setTaskCompleted: "renamedCompletion",
          updateTaskTitle: "renamedTitle",
          deleteTask: "renamedDelete",
        },
      }),
    );
    const output = await client.callTool({ name: "renamedList", arguments: {} });
    expect(output.structuredContent).toEqual(
      era === "modern" ? ["unchanged output"] : { result: ["unchanged output"] },
    );
    expect(spec).toEqual(before);
  });

  it("omits excluded mutations from the widget configuration", async () => {
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getSpec: () => ({
          ...fixtureSpec({
            "/tasks": {
              get: { ...operation("listTasks"), "x-mcp": true },
              post: operation("createTask"),
            },
            "/tasks/completion": {
              "x-mcp": true,
              patch: { ...operation("setTaskCompleted"), "x-mcp": false },
              delete: { ...operation("deleteTask"), "x-mcp": false },
            },
            "/tasks/title": {
              patch: { ...operation("updateTaskTitle"), "x-mcp": false },
            },
          }),
          "x-mcp": false,
        }),
        getAppHtml: () => appHtml,
      }),
      era,
    );
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["listTasks"]);
    const { contents } = await client.readResource({ uri: mcpAppResourceUri });
    expect(contents[0] && "text" in contents[0] ? contents[0].text : "").toContain(
      JSON.stringify({ tools: { listTasks: "listTasks" } }),
    );
  });

  it("does not publish the App resource when the list operation is excluded", async () => {
    const getAppHtml = vi.fn(() => appHtml);
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getSpec: () =>
          fixtureSpec({
            "/tasks": {
              "x-mcp": false,
              get: operation("listTasks"),
              post: { ...operation("createTask"), "x-mcp": true },
            },
          }),
        getAppHtml,
      }),
      era,
    );
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["createTask"]);
    await expect(client.readResource({ uri: mcpAppResourceUri })).rejects.toThrow();
    expect(getAppHtml).not.toHaveBeenCalled();
  });

  it("masks missing asset errors without breaking JSON tools and can recover", async () => {
    const getAppHtml = vi
      .fn(async () => appHtml)
      .mockRejectedValueOnce(new Error("ENOENT /private/deployment/secrets/path"));
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getAppHtml,
      }),
      era,
    );
    const error = await client
      .readResource({ uri: mcpAppResourceUri })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("The MCP App is unavailable.");
    expect(String(error)).not.toContain("private");
    expect(
      await client.callTool({ name: "listTasks", arguments: { status: "all" } }),
    ).toMatchObject({
      structuredContent: era === "modern" ? [] : { result: [] },
    });
    await expect(client.readResource({ uri: mcpAppResourceUri })).resolves.toMatchObject({
      contents: [{ uri: mcpAppResourceUri }],
    });
  });

  it("masks malformed HTML assets as resource errors", async () => {
    const client = await connect(
      endpoint({
        getContext: () => ({ repository: createDemoRepository([]) }),
        getAppHtml: () => "<html>Missing configuration</html>",
      }),
      era,
    );
    await expect(client.readResource({ uri: mcpAppResourceUri })).rejects.toThrow(
      "The MCP App is unavailable.",
    );
  });
});

describe("MCP task endpoint lifecycle", () => {
  it.each(["createTask", "deleteTask", "updateTaskTitle"])(
    "awaits asynchronous invalidation for %s before returning success",
    async (name) => {
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
        endpoint({ getContext: () => ({ repository: createDemoRepository(), onTasksChanged }) }),
      );
      let returned = false;
      const call = client
        .callTool({
          name,
          arguments:
            name === "createTask"
              ? { title: "Await invalidation" }
              : name === "updateTaskTitle"
                ? { id: "explore", title: "Await invalidation" }
                : { id: "explore" },
        })
        .then((result) => {
          returned = true;
          return result;
        });

      await invalidationStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(returned).toBe(false);
      finishInvalidation?.();
      await expect(call).resolves.toMatchObject({
        structuredContent: {
          title: name === "deleteTask" ? "Explore the workspace" : "Await invalidation",
        },
      });
      expect(onTasksChanged).toHaveBeenCalledOnce();
    },
  );

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
    const firstTask = first.repository.list("all")[0];
    expect(firstTask).toBeDefined();
    await expect(
      firstClient.callTool({
        name: "updateTaskTitle",
        arguments: { id: firstTask?.id, title: "Edited first context" },
      }),
    ).resolves.toMatchObject({
      structuredContent: { ...firstTask, title: "Edited first context" },
    });
    expect(second.repository.list("all").map((task) => task.title)).toEqual(["Second context"]);
    await expect(
      firstClient.callTool({ name: "deleteTask", arguments: { id: firstTask?.id } }),
    ).resolves.toMatchObject({
      structuredContent: { ...firstTask, title: "Edited first context" },
    });
    expect(first.repository.list("all")).toEqual([]);
    expect(second.repository.list("all").map((task) => task.title)).toEqual(["Second context"]);
    expect(first.onTasksChanged).toHaveBeenCalledTimes(3);
    expect(second.onTasksChanged).toHaveBeenCalledOnce();
    expect(getSpec).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledTimes(6);
  });
});
