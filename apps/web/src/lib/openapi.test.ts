import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { oc } from "@orpc/contract";
import { OpenAPIGenerator } from "@orpc/openapi";
import { type } from "arktype";
import { describe, expect, it, vi } from "vitest";
import {
  createNoteStore,
  type FixtureContext,
  type fixtureContract,
  fixtureRouter,
  fixtureSpecOptions,
  type Note,
  type NoteStore,
  noteTextMaxLength,
} from "@/testing/fixture-api";
import { createOpenApi, DirectionalArkTypeConverter } from "./openapi";
import { createRpc } from "./rpc";

const openApi = createOpenApi(fixtureRouter, fixtureSpecOptions);
const handleRpc = createRpc(fixtureRouter);
const seed: readonly Note[] = [
  { id: "first", text: "First", pinned: false },
  { id: "second", text: "Second", pinned: true },
];

// Route handlers receive a Proxy like this one; `new Request(proxy)` cannot read its fields.
function nextRequest(request: Request) {
  return new Proxy(request, { get: (target, key) => Reflect.get(target, key, target) });
}

function context(store = createNoteStore(seed)) {
  return { store, onChanged: vi.fn() } satisfies FixtureContext;
}

function request(context: FixtureContext, path: string, method = "GET", body?: unknown) {
  return openApi.handle(
    nextRequest(
      new Request(`http://localhost/api${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      }),
    ),
    context,
  );
}

function rpcClient(context: FixtureContext): ContractRouterClient<typeof fixtureContract> {
  return createORPCClient(
    new RPCLink({
      url: "http://localhost/api/rpc",
      fetch: (rpcRequest) => handleRpc(nextRequest(rpcRequest), context),
    }),
  );
}

function expectUnchanged(target: ReturnType<typeof context>) {
  expect(target.store.list("all")).toEqual(seed);
  expect(target.onChanged).not.toHaveBeenCalled();
}

describe("generated OpenAPI specification", () => {
  it("maps query, body, and path inputs with their success statuses and errors", async () => {
    const spec = await openApi.generateSpec();

    expect(spec).toMatchObject({
      openapi: "3.1.1",
      info: { title: "Fixture API", version: "1.0.0" },
      servers: [{ url: "/api" }],
      paths: {
        "/notes": {
          get: {
            operationId: "listNotes",
            "x-mcp": { annotations: { readOnlyHint: true } },
            parameters: [
              {
                name: "filter",
                in: "query",
                required: true,
                schema: { enum: expect.arrayContaining(["all", "pinned"]) },
              },
            ],
            responses: {
              "200": { content: { "application/json": { schema: { type: "array" } } } },
            },
          },
          post: {
            operationId: "createNote",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { type: "object", required: ["text"], properties: { text: {} } },
                },
              },
            },
            responses: { "201": { description: "Note created" } },
          },
        },
        "/notes/{id}": {
          patch: {
            operationId: "updateNote",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": expect.any(Object), "404": expect.any(Object) },
          },
          delete: {
            operationId: "deleteNote",
            parameters: [{ name: "id", in: "path", required: true }],
            responses: { "200": expect.any(Object), "404": expect.any(Object) },
          },
        },
      },
    });
    expect(Object.keys(spec.paths ?? {}).sort()).toEqual(["/notes", "/notes/{id}"]);
    expect(spec.paths?.["/notes/{id}"]?.delete?.requestBody).toBeUndefined();
  });

  it("documents normalized output limits without rejecting padded raw input", async () => {
    const create = (await openApi.generateSpec()).paths?.["/notes"]?.post;

    expect(create?.responses?.["201"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: { text: { type: "string", minLength: 1, maxLength: noteTextMaxLength } },
          },
        },
      },
    });
    expect(JSON.stringify(create?.requestBody)).not.toContain(`"maxLength":${noteTextMaxLength}`);
    expect(JSON.stringify(create?.requestBody)).not.toContain('"minLength":1');
  });

  it("serves the generated document publicly without caching it", async () => {
    const response = await request(context(), "/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(await openApi.generateSpec());
  });

  it("fails visibly when a schema cannot be represented as JSON Schema", () => {
    const converter = new DirectionalArkTypeConverter();
    const refined = type("string").narrow((value) => value.startsWith("prefix"));
    expect(() => converter.convert(refined, { strategy: "input" })).toThrow();
    expect(() => converter.convert(refined, { strategy: "output" })).toThrow();
  });

  it("rejects missing or non-ArkType schemas passed directly to the converter", () => {
    const converter = new DirectionalArkTypeConverter();
    const otherSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "other",
        validate: (value: unknown) => ({ value }),
      },
    };

    expect(() => converter.convert(undefined, { strategy: "input" })).toThrow(
      "Expected an ArkType schema.",
    );
    expect(() => converter.convert(otherSchema, { strategy: "input" })).toThrow(
      "Expected an ArkType schema.",
    );
  });

  it.each(["input", "output"] as const)(
    "rejects unsupported %s schemas during specification generation",
    async (direction) => {
      const otherSchema = {
        "~standard": {
          version: 1 as const,
          vendor: "other",
          validate: (value: unknown) => ({ value }),
        },
      };
      const procedure = oc.route({ method: "POST", path: "/unsupported" });
      const generator = new OpenAPIGenerator({
        schemaConverters: [new DirectionalArkTypeConverter()],
      });

      await expect(
        generator.generate(
          {
            unsupported:
              direction === "input" ? procedure.input(otherSchema) : procedure.output(otherSchema),
          },
          { info: { title: "Converter test", version: "1.0.0" } },
        ),
      ).rejects.toThrow("Expected an ArkType schema.");
    },
  );

  it("still generates procedures with no input or output schema", async () => {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new DirectionalArkTypeConverter()],
    });

    await expect(
      generator.generate(
        { ping: oc.route({ method: "GET", path: "/ping" }) },
        { info: { title: "Converter test", version: "1.0.0" } },
      ),
    ).resolves.toMatchObject({ paths: { "/ping": { get: { operationId: "ping" } } } });
  });
});

describe("OpenAPI HTTP adapter", () => {
  it("serves public Scalar HTML with the pinned renderer and generated contract", async () => {
    const response = await request(context(), "/docs");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("<title>Prelude API Reference</title>");
    expect(html).toContain(
      'src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js"',
    );
    expect(html).toContain('"withDefaultFonts":false');
    expect(html).toContain('"telemetry":false');
    expect(html).toContain('"agent":{"disabled":true}');
    for (const operationId of ["listNotes", "createNote", "updateNote", "deleteNote"]) {
      expect(html).toContain(operationId);
    }
    expect(html).not.toContain("proxy.scalar.com");
  });

  it("serves GET, POST, PATCH, and DELETE with state shared with RPC", async () => {
    const target = context(createNoteStore([]));
    const create = await request(target, "/notes", "POST", { text: "  Padded  " });
    expect(create.status).toBe(201);
    const note = (await create.json()) as Note;
    expect(note).toMatchObject({ text: "Padded", pinned: false });

    const update = await request(target, `/notes/${note.id}`, "PATCH", { pinned: true });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ ...note, pinned: true });
    const pinned = await request(target, "/notes?filter=pinned");
    expect(pinned.status).toBe(200);
    expect(await pinned.json()).toEqual([{ ...note, pinned: true }]);

    const rpc = rpcClient(target);
    await expect(rpc.notes.list({ filter: "all" })).resolves.toEqual([{ ...note, pinned: true }]);
    await expect(rpc.notes.update({ id: note.id, text: " Through RPC " })).resolves.toEqual({
      ...note,
      text: "Through RPC",
      pinned: true,
    });
    const deleted = await request(target, `/notes/${note.id}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ...note, text: "Through RPC", pinned: true });
    await expect(rpc.notes.delete({ id: note.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(target.onChanged).toHaveBeenCalledTimes(4);
    for (const response of [create, update, pinned, deleted]) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it.each<[path: string, method: string, body?: unknown]>([
    ["/notes", "GET", undefined],
    ["/notes?filter=invalid", "GET", undefined],
    ["/notes", "POST", {}],
    ["/notes", "POST", { text: 42 }],
    ["/notes", "POST", { text: "   " }],
    ["/notes", "POST", { text: "x".repeat(noteTextMaxLength + 1) }],
    ["/notes/first", "PATCH", { pinned: "true" }],
  ])("rejects invalid %s %s input before mutation: %j", async (path, method, body) => {
    const target = context();
    const response = await request(target, path, method, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectUnchanged(target);
  });

  it.each([
    ["PATCH", { pinned: true }],
    ["DELETE", undefined],
  ] as const)("returns the typed NOT_FOUND error for %s", async (method, body) => {
    const target = context();
    const response = await request(target, "/notes/missing", method, body);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND", message: "Note not found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectUnchanged(target);
  });

  it("returns a non-cacheable 404 for an unmatched path", async () => {
    const response = await request(context(), "/unknown");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("awaits the mutation's asynchronous side effects before responding", async () => {
    let settled = false;
    const response = await request(
      {
        store: createNoteStore([]),
        onChanged: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          settled = true;
        },
      },
      "/notes",
      "POST",
      { text: "Fresh note" },
    );

    expect(response.status).toBe(201);
    expect(settled).toBe(true);
  });

  it("keeps concurrent requests bound to their own context", async () => {
    const first = context(createNoteStore([]));
    const second = context(createNoteStore([]));
    const responses = await Promise.all([
      request(first, "/notes", "POST", { text: "First context" }),
      request(second, "/notes", "POST", { text: "Second context" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(first.store.list("all").map((note) => note.text)).toEqual(["First context"]);
    expect(second.store.list("all").map((note) => note.text)).toEqual(["Second context"]);
    expect(first.onChanged).toHaveBeenCalledOnce();
    expect(second.onChanged).toHaveBeenCalledOnce();
  });

  it.each([
    ["list", "/notes?filter=all", "GET", undefined],
    ["delete", "/notes/first", "DELETE", undefined],
  ] as const)(
    "turns invalid %s output into a logged 500 instead of a successful response",
    async (method, path, httpMethod, body) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const broken = { list: () => [{ id: "broken", text: 42 }], delete: () => ({ id: "broken" }) };
      const store = { ...createNoteStore(seed), [method]: broken[method] } as unknown as NoteStore;
      const response = await request({ store }, path, httpMethod, body);

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(logged).toHaveBeenCalledOnce();
      logged.mockRestore();
    },
  );
});

describe("body limits", () => {
  const oversized = { text: "Oversized", pad: "x".repeat(64 * 1024) };

  it.each([
    ["POST", "/notes"],
    ["PATCH", "/notes/first"],
  ] as const)("rejects an oversized %s %s body before mutation", async (method, path) => {
    const target = context();
    const response = await request(target, path, method, oversized);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectUnchanged(target);
  });

  function rpcPost(target: FixtureContext, json: unknown) {
    return handleRpc(
      nextRequest(
        new Request("http://localhost/api/rpc/notes/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json }),
        }),
      ),
      target,
    );
  }

  it("rejects an oversized RPC body before mutation", async () => {
    const target = context();
    const response = await rpcPost(target, oversized);

    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectUnchanged(target);
  });

  it("accepts an RPC body within the limit from a route-handler request", async () => {
    const target = context(createNoteStore([]));
    const response = await rpcPost(target, { text: "Within limit" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { json: note } = await response.json();
    expect(target.store.list("all")).toEqual([note]);
  });

  it("returns a non-cacheable 404 for an unknown RPC procedure", async () => {
    const response = await handleRpc(
      new Request("http://localhost/api/rpc/unknown", { method: "POST" }),
      context(),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
