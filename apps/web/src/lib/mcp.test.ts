import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { implement } from "@orpc/server";
import { OpenAPIToolGenerator } from "mcp-from-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { site } from "@/site";
import {
  createNoteStore,
  type FixtureContext,
  fixtureRouter,
  fixtureSpecOptions,
  type Note,
  type NoteStore,
} from "@/testing/fixture-api";
import { expectedToolNames } from "@/testing/mcp-tool-names";
import { createMcpEndpoint, generateMcpCatalog, type McpEndpointOptions } from "./mcp";
import { createOpenApi } from "./openapi";

type Endpoint = ReturnType<typeof createMcpEndpoint>;
const endpoints: Endpoint[] = [];
const clients: Client[] = [];
const openApi = createOpenApi(fixtureRouter, fixtureSpecOptions);
const seed: readonly Note[] = [{ id: "first", text: "First", pinned: false }];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const endpoint of endpoints.splice(0)) await endpoint.close();
  vi.restoreAllMocks();
});

function endpoint(options: Partial<McpEndpointOptions<FixtureContext>> = {}) {
  const result = createMcpEndpoint({
    getContext: () => ({ store: createNoteStore() }),
    getSpec: openApi.generateSpec,
    dispatch: openApi.handle,
    ...options,
  });
  endpoints.push(result);
  return result;
}

function fixtureContext(store = createNoteStore(seed)) {
  return { store, onChanged: vi.fn() } satisfies FixtureContext;
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
  it("generates schemas and annotations without mutating the OpenAPI document", async () => {
    const spec = await openApi.generateSpec();
    const before = structuredClone(spec);
    const catalog = await generateMcpCatalog(spec);

    expect(catalog.map((tool) => tool.name).sort()).toEqual([
      "createNote",
      "deleteNote",
      "listNotes",
      "updateNote",
    ]);
    expect(catalog.find((tool) => tool.name === "listNotes")).toMatchObject({
      inputSchema: { type: "object", required: ["filter"] },
      outputSchema: { type: "array" },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    });
    expect(catalog.find((tool) => tool.name === "updateNote")).toMatchObject({
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" }, pinned: {} },
        required: ["id"],
      },
      outputSchema: { type: "object", required: expect.arrayContaining(["id", "text"]) },
      metadata: { operationId: "updateNote", method: "patch", path: "/notes/{id}" },
    });
    expect(catalog.find((tool) => tool.name === "deleteNote")).toMatchObject({
      inputSchema: { type: "object", required: ["id"] },
      metadata: { operationId: "deleteNote", method: "delete", path: "/notes/{id}" },
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

  it("matches the tool names the browser suites expect, with renames and opt-outs", async () => {
    const spec = {
      ...fixtureSpec({
        "/renamed": { get: { ...operation("original"), "x-mcp": { name: "renamed" } } },
        "/hidden": { get: { ...operation("hidden"), "x-mcp": { enabled: false } } },
        // Operation objects without `enabled` inherit the path, then the root setting.
        "/enabled": {
          "x-mcp": true,
          get: { ...operation("deprecated"), deprecated: true },
          post: { ...operation("inherited"), "x-mcp": { annotations: { idempotentHint: true } } },
        },
        "/root": {
          get: { ...operation("annotated"), "x-mcp": { annotations: { readOnlyHint: true } } },
        },
      }),
      "x-mcp": false,
    };
    const catalog = await generateMcpCatalog({ ...spec, "x-mcp": true });
    expect(await expectedToolNames({ ...spec, "x-mcp": true })).toEqual(
      catalog.map((tool) => tool.name).sort(),
    );
    expect(catalog.map((tool) => tool.name).sort()).toEqual([
      "annotated",
      "deprecated",
      "inherited",
      "renamed",
    ]);
    const optedOut = (await generateMcpCatalog(spec)).map((tool) => tool.name).sort();
    expect(await expectedToolNames(spec)).toEqual(optedOut);
    expect(optedOut).toEqual(["deprecated", "inherited"]);
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
    ).rejects.toThrow("MCP schema for the OpenAPI document contains an external reference");
  });
});

describe.each(["modern", "legacy"] as const)("MCP %s HTTP compatibility", (era) => {
  it("lists tools and validates natural output through the official client", async () => {
    const networkFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const context = fixtureContext(createNoteStore([]));
    const bodies: unknown[] = [];
    const dispatch = vi.fn(async (request: Request, requestContext: FixtureContext) => {
      bodies.push(request.body === null ? null : await request.clone().json());
      return openApi.handle(request, requestContext);
    });
    const client = await connect(endpoint({ getContext: () => context, dispatch }), era);
    expect(client.getServerVersion()?.name).toBe(site.slug);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "createNote",
      "deleteNote",
      "listNotes",
      "updateNote",
    ]);
    expect(tools.find((tool) => tool.name === "listNotes")?.outputSchema).toMatchObject(
      era === "modern"
        ? { type: "array" }
        : { type: "object", properties: { result: { type: "array" } }, required: ["result"] },
    );

    const created = await client.callTool({ name: "createNote", arguments: { text: "  Pad  " } });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({ text: "Pad", pinned: false });
    const note = created.structuredContent as Note;
    const updated = await client.callTool({
      name: "updateNote",
      arguments: { id: note.id, pinned: true },
    });
    const pinnedNote = { ...note, pinned: true };
    expect(updated.structuredContent).toEqual(pinnedNote);
    expect(updated.content).toContainEqual({ type: "text", text: JSON.stringify(pinnedNote) });
    const listed = await client.callTool({ name: "listNotes", arguments: { filter: "pinned" } });
    expect(listed.structuredContent).toEqual(
      era === "modern" ? [pinnedNote] : { result: [pinnedNote] },
    );
    expect(listed.content).toContainEqual({ type: "text", text: JSON.stringify([pinnedNote]) });
    const deleted = await client.callTool({ name: "deleteNote", arguments: { id: note.id } });
    expect(deleted.structuredContent).toEqual(pinnedNote);
    expect(context.store.list("all")).toEqual([]);
    const repeated = await client.callTool({ name: "deleteNote", arguments: { id: note.id } });
    expect(repeated.isError).toBe(true);
    expect(JSON.stringify(repeated.content)).toContain("NOT_FOUND");
    expect(context.onChanged).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls.map(([request]) => `${request.method} ${request.url}`)).toEqual([
      "POST http://prelude.internal/api/notes",
      `PATCH http://prelude.internal/api/notes/${note.id}`,
      "GET http://prelude.internal/api/notes?filter=pinned",
      `DELETE http://prelude.internal/api/notes/${note.id}`,
      `DELETE http://prelude.internal/api/notes/${note.id}`,
    ]);
    // Path parameters stay in the URL, so the path-parameter guard accepts MCP calls.
    expect(bodies).toEqual([{ text: "  Pad  " }, { pinned: true }, null, null, null]);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs without writes and returns typed missing-record errors", async () => {
    const context = fixtureContext();
    const client = await connect(endpoint({ getContext: () => context }), era);
    for (const args of [{}, { text: 42 }, { text: "   " }, { text: "x".repeat(21) }]) {
      expect((await client.callTool({ name: "createNote", arguments: args })).isError).toBe(true);
    }
    const invalidFilter = await client.callTool({ name: "listNotes", arguments: { filter: "x" } });
    expect(invalidFilter.isError).toBe(true);
    for (const args of [{}, { id: "" }, { id: 42 }, { id: "missing" }]) {
      const deleted = await client.callTool({ name: "deleteNote", arguments: args });
      expect(deleted.isError).toBe(true);
      expect(deleted.structuredContent).toBeUndefined();
      if (args.id === "missing") expect(JSON.stringify(deleted.content)).toContain("NOT_FOUND");
    }
    const missing = await client.callTool({
      name: "updateNote",
      arguments: { id: "missing", pinned: true },
    });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain("NOT_FOUND");
    expect(context.store.list("all")).toEqual(seed);
    expect(context.onChanged).not.toHaveBeenCalled();
  });

  it("returns safe tool errors for invalid output and unexpected failures", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = {
      ...createNoteStore(seed),
      list: () => [{ id: "broken", text: 42 }],
      create: () => {
        throw new Error("PRIVATE_DATABASE_PASSWORD");
      },
      delete: () => ({ id: "broken" }),
    } as unknown as NoteStore;
    const client = await connect(endpoint({ getContext: () => ({ store }) }), era);
    for (const request of [
      { name: "listNotes", arguments: { filter: "all" } },
      { name: "createNote", arguments: { text: "Safe error" } },
      { name: "deleteNote", arguments: { id: "first" } },
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
    expect(logged).toHaveBeenCalledTimes(3);
  });

  it("rejects unknown tools and malformed protocol input", async () => {
    const dispatch = vi.fn(openApi.handle);
    const handler = endpoint({ dispatch });
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

describe.each(["modern", "legacy"] as const)("MCP %s endpoint without operations", (era) => {
  // An API without procedures, as in a new project before its first feature.
  const empty = createOpenApi(
    implement({}).$context<FixtureContext>().router({}),
    fixtureSpecOptions,
  );

  it("advertises tools and lists none, so clients and Inspector can connect", async () => {
    const client = await connect(
      endpoint({ getSpec: empty.generateSpec, dispatch: empty.handle }),
      era,
    );
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    await expect(client.listTools()).resolves.toMatchObject({ tools: [] });
    await expect(client.callTool({ name: "listNotes", arguments: {} })).rejects.toThrow();
  });

  it("does not advertise resources, so resources/list is an unknown method", async () => {
    const client = await connect(
      endpoint({ getSpec: empty.generateSpec, dispatch: empty.handle }),
      era,
    );
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    const listed = client.request({ method: "resources/list", params: {} });
    // Modern HTTP answers an unknown method with 404 and the JSON-RPC error as the body.
    if (era === "modern") await expect(listed).rejects.toThrow(/"code":-32601/);
    else await expect(listed).rejects.toMatchObject({ code: -32601 });
  });
});

describe("MCP endpoint lifecycle", () => {
  it.each([
    ["createNote", { text: "Await side effects" }],
    ["updateNote", { id: "first", text: "Await side effects" }],
    ["deleteNote", { id: "first" }],
  ] as const)("awaits asynchronous side effects for %s before returning", async (name, args) => {
    let finish: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const onChanged = vi.fn(async () => {
      signalStarted?.();
      await done;
    });
    const client = await connect(
      endpoint({ getContext: () => ({ store: createNoteStore(seed), onChanged }) }),
    );
    let returned = false;
    const call = client.callTool({ name, arguments: args }).then((result) => {
      returned = true;
      return result;
    });

    await started;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(returned).toBe(false);
    finish?.();
    await expect(call).resolves.toMatchObject({
      structuredContent: { text: name === "deleteNote" ? "First" : "Await side effects" },
    });
    expect(onChanged).toHaveBeenCalledOnce();
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

  it("does not expose unexpected adapter exceptions, but logs them once", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = await connect(
      endpoint({
        dispatch: async () => {
          throw new Error("PRIVATE_ADAPTER_DETAILS");
        },
      }),
    );
    const result = await client.callTool({ name: "listNotes", arguments: { filter: "all" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ADAPTER_DETAILS");
    expect(logged).toHaveBeenCalledOnce();
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toMatchObject({
      message: "MCP tool call failed",
      tool: "listNotes",
      error: { message: "PRIVATE_ADAPTER_DETAILS" },
    });
  });

  it.each([200, 204])("supports generated operations with an empty %i response", async (status) => {
    const client = await connect(
      endpoint({
        getSpec: () =>
          fixtureSpec({
            "/empty": {
              delete: {
                operationId: "emptyResponse",
                responses: { [status]: { description: "Deleted" } },
              },
            },
          }),
        dispatch: async () => new Response(null, { status }),
      }),
    );
    const result = await client.callTool({ name: "emptyResponse", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeNull();
  });

  it("isolates concurrent request contexts while sharing only immutable tool definitions", async () => {
    const first = fixtureContext(createNoteStore([]));
    const second = fixtureContext(createNoteStore([]));
    const getSpec = vi.fn(openApi.generateSpec);
    const getContext = vi.fn((request: Request) =>
      request.headers.get("x-test-context") === "first" ? first : second,
    );
    const handler = endpoint({ getContext, getSpec });
    const [firstClient, secondClient] = await Promise.all([
      connect(handler, "modern", { "x-test-context": "first" }),
      connect(handler, "modern", { "x-test-context": "second" }),
    ]);
    await Promise.all([
      firstClient.callTool({ name: "createNote", arguments: { text: "First context" } }),
      secondClient.callTool({ name: "createNote", arguments: { text: "Second context" } }),
    ]);
    expect(first.store.list("all").map((note) => note.text)).toEqual(["First context"]);
    expect(second.store.list("all").map((note) => note.text)).toEqual(["Second context"]);
    const firstNote = first.store.list("all")[0];
    await expect(
      firstClient.callTool({ name: "deleteNote", arguments: { id: firstNote?.id } }),
    ).resolves.toMatchObject({ structuredContent: firstNote });
    expect(first.store.list("all")).toEqual([]);
    expect(second.store.list("all").map((note) => note.text)).toEqual(["Second context"]);
    expect(first.onChanged).toHaveBeenCalledTimes(2);
    expect(second.onChanged).toHaveBeenCalledOnce();
    expect(getSpec).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledTimes(5);
  });

  it("retries failed specification generation instead of caching a failed catalog", async () => {
    const getSpec = vi
      .fn(openApi.generateSpec)
      .mockRejectedValueOnce(new Error("Temporary failure"));
    const handler = endpoint({ getSpec });
    await expect(connect(handler)).rejects.toThrow();
    const client = await connect(handler);
    await expect(client.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
    expect(getSpec).toHaveBeenCalledTimes(2);
  });

  it("returns 405 for legacy session GET and DELETE without creating request context", async () => {
    const getContext = vi.fn(() => ({ store: createNoteStore() }));
    const handler = endpoint({ getContext });
    for (const method of ["GET", "DELETE"]) {
      const response = await handler.fetch(new Request("http://localhost/api/mcp", { method }));
      expect(response.status).toBe(405);
    }
    expect(getContext).not.toHaveBeenCalled();
  });
});
