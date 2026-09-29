import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { oc } from "@orpc/contract";
import { OpenAPIGenerator } from "@orpc/openapi";
import { RPCHandler } from "@orpc/server/fetch";
import { type Context, createDemoRepository, router, type TaskRepository } from "@repo/api";
import type { ApiClient, Task } from "@repo/contracts";
import { type } from "arktype";
import { describe, expect, it, vi } from "vitest";
import { DirectionalArkTypeConverter, generateOpenApiSpec, handleOpenApiRequest } from "./openapi";

function request(context: Context, path: string, method = "GET", body?: unknown) {
  return handleOpenApiRequest(
    new Request(`http://localhost/api${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    }),
    context,
  );
}

describe("generated OpenAPI specification", () => {
  it("describes the task operations and maps query, body, and path inputs", async () => {
    const spec = await generateOpenApiSpec();

    expect(spec).toMatchObject({
      openapi: "3.1.1",
      info: { title: "Prelude API", version: "1.0.0" },
      servers: [{ url: "/api" }],
      paths: {
        "/v1/tasks": {
          get: {
            operationId: "listTasks",
            tags: ["Tasks"],
            parameters: [
              {
                name: "status",
                in: "query",
                required: true,
                example: "all",
                schema: { enum: expect.arrayContaining(["all", "active", "completed"]) },
              },
            ],
            responses: {
              "200": {
                content: { "application/json": { schema: { type: "array" } } },
              },
            },
          },
          post: {
            operationId: "createTask",
            tags: ["Tasks"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  example: { title: "Build a feature" },
                  schema: {
                    type: "object",
                    required: ["title"],
                    properties: { title: { type: "string" } },
                  },
                },
              },
            },
            responses: { "201": expect.any(Object) },
          },
        },
        "/v1/tasks/{id}": {
          patch: {
            operationId: "setTaskCompleted",
            tags: ["Tasks"],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  example: { completed: true },
                  schema: {
                    type: "object",
                    required: ["completed"],
                    properties: { completed: { type: "boolean" } },
                  },
                },
              },
            },
            responses: { "200": expect.any(Object), "404": expect.any(Object) },
          },
          delete: {
            operationId: "deleteTask",
            tags: ["Tasks"],
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } },
            ],
            responses: {
              "200": {
                description: "Task deleted",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: expect.arrayContaining(["id", "title", "completed"]),
                    },
                  },
                },
              },
              "404": expect.any(Object),
            },
          },
        },
        "/v1/tasks/{id}/title": {
          patch: {
            operationId: "updateTaskTitle",
            tags: ["Tasks"],
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  example: { title: "Polish a feature" },
                  schema: {
                    type: "object",
                    required: ["title"],
                    properties: { title: { type: "string" } },
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "Task title updated",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: expect.arrayContaining(["id", "title", "completed"]),
                    },
                  },
                },
              },
              "404": expect.any(Object),
            },
          },
        },
      },
    });
    expect(Object.keys(spec.paths ?? {}).sort()).toEqual([
      "/v1/tasks",
      "/v1/tasks/{id}",
      "/v1/tasks/{id}/title",
    ]);
    expect(spec.paths?.["/v1/tasks/{id}"]?.delete?.requestBody).toBeUndefined();
  });

  it("documents normalized output limits without rejecting padded raw input", async () => {
    const spec = await generateOpenApiSpec();
    const create = spec.paths?.["/v1/tasks"]?.post;

    expect(create?.responses?.["201"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: { title: { type: "string", minLength: 1, maxLength: 120 } },
          },
        },
      },
    });
    expect(JSON.stringify(create?.requestBody)).not.toContain('"maxLength":120');
    expect(JSON.stringify(create?.requestBody)).not.toContain('"minLength":1');
    const edit = spec.paths?.["/v1/tasks/{id}/title"]?.patch;
    expect(edit?.description).toContain("normalized title must contain 1–120 characters");
    expect(edit?.responses?.["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: { properties: { title: { type: "string", minLength: 1, maxLength: 120 } } },
        },
      },
    });
    expect(JSON.stringify(edit?.requestBody)).not.toContain('"maxLength":120');
    expect(JSON.stringify(edit?.requestBody)).not.toContain('"minLength":1');
  });

  it("serves the generated document publicly without caching it", async () => {
    const response = await request({ repository: createDemoRepository([]) }, "/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(await generateOpenApiSpec());
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
    const response = await request({ repository: createDemoRepository([]) }, "/docs");
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
    expect(html).toContain("listTasks");
    expect(html).toContain("createTask");
    expect(html).toContain("deleteTask");
    expect(html).toContain("updateTaskTitle");
    expect(html).not.toContain("proxy.scalar.com");
  });

  it("creates, completes, edits, filters, and deletes tasks shared with RPC", async () => {
    const context: Context = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const create = await request(context, "/v1/tasks", "POST", {
      title: `  ${"x".repeat(120)}  `,
    });
    expect(create.status).toBe(201);
    const task = (await create.json()) as Task;
    expect(task).toMatchObject({ title: "x".repeat(120), completed: false });
    expect(task.id).not.toBe("");

    const active = await request(context, "/v1/tasks?status=active");
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual([task]);

    const update = await request(context, `/v1/tasks/${task.id}`, "PATCH", { completed: true });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ ...task, completed: true });
    expect(await (await request(context, "/v1/tasks?status=active")).json()).toEqual([]);
    expect(await (await request(context, "/v1/tasks?status=completed")).json()).toEqual([
      { ...task, completed: true },
    ]);

    const rpcHandler = new RPCHandler(router);
    const rpcClient: ApiClient = createORPCClient(
      new RPCLink({
        url: "http://localhost/api/rpc",
        fetch: async (rpcRequest) => {
          const result = await rpcHandler.handle(rpcRequest, { prefix: "/api/rpc", context });
          if (!result.matched) throw new Error("RPC request was not matched");
          return result.response;
        },
      }),
    );
    await expect(rpcClient.tasks.list({ status: "all" })).resolves.toEqual([
      { ...task, completed: true },
    ]);
    const edit = await request(context, `/v1/tasks/${task.id}/title`, "PATCH", {
      title: "  Edited through REST  ",
    });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toEqual({ ...task, title: "Edited through REST", completed: true });
    await expect(rpcClient.tasks.list({ status: "completed" })).resolves.toEqual([
      { ...task, title: "Edited through REST", completed: true },
    ]);
    await expect(
      rpcClient.tasks.updateTitle({ id: task.id, title: "  Edited through RPC  " }),
    ).resolves.toEqual({
      ...task,
      title: "Edited through RPC",
      completed: true,
    });
    expect(await (await request(context, "/v1/tasks?status=completed")).json()).toEqual([
      { ...task, title: "Edited through RPC", completed: true },
    ]);
    const deleted = await request(context, `/v1/tasks/${task.id}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ...task, title: "Edited through RPC", completed: true });
    await expect(rpcClient.tasks.list({ status: "all" })).resolves.toEqual([]);
    await expect(rpcClient.tasks.delete({ id: task.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const rpcTask = await rpcClient.tasks.create({ title: "Delete through RPC" });
    await expect(rpcClient.tasks.delete({ id: rpcTask.id })).resolves.toEqual(rpcTask);
    expect(await (await request(context, "/v1/tasks?status=all")).json()).toEqual([]);
    expect(context.onTasksChanged).toHaveBeenCalledTimes(7);
    expect(create.headers.get("Cache-Control")).toBe("no-store");
    expect(active.headers.get("Cache-Control")).toBe("no-store");
    expect(update.headers.get("Cache-Control")).toBe("no-store");
    expect(deleted.headers.get("Cache-Control")).toBe("no-store");
    expect(edit.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each<[path: string, method: string, body?: unknown]>([
    ["/v1/tasks", "GET", undefined],
    ["/v1/tasks?status=invalid", "GET", undefined],
    ["/v1/tasks", "POST", {}],
    ["/v1/tasks", "POST", { title: 42 }],
    ["/v1/tasks", "POST", { title: "   " }],
    ["/v1/tasks", "POST", { title: "x".repeat(121) }],
    ["/v1/tasks/explore", "PATCH", { completed: "true" }],
    ["/v1/tasks/explore", "PATCH", {}],
    ["/v1/tasks/explore/title", "PATCH", {}],
    ["/v1/tasks/explore/title", "PATCH", { title: 42 }],
    ["/v1/tasks/explore/title", "PATCH", { title: "   " }],
    ["/v1/tasks/explore/title", "PATCH", { title: "x".repeat(121) }],
  ])("rejects invalid %s %s input before mutation: %j", async (path, method, body) => {
    const repository = createDemoRepository();
    const before = repository.list("all");
    const changed = vi.fn();
    const response = await request({ repository, onTasksChanged: changed }, path, method, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(repository.list("all")).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    ["PATCH", "", { completed: true }],
    ["DELETE", "", undefined],
    ["PATCH", "/title", { title: "Edited" }],
  ] as const)(
    "returns the typed missing-task error for %s %s without invalidating caches",
    async (method, suffix, body) => {
      const changed = vi.fn();
      const response = await request(
        { repository: createDemoRepository([]), onTasksChanged: changed },
        `/v1/tasks/missing${suffix}`,
        method,
        body,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND", message: "Task not found" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it("returns NOT_FOUND for a repeated HTTP deletion and invalidates only once", async () => {
    const repository = createDemoRepository();
    const changed = vi.fn();
    const context = { repository, onTasksChanged: changed };
    expect((await request(context, "/v1/tasks/explore", "DELETE")).status).toBe(200);
    const repeated = await request(context, "/v1/tasks/explore", "DELETE");
    expect(repeated.status).toBe(404);
    expect(await repeated.json()).toMatchObject({ code: "NOT_FOUND", message: "Task not found" });
    expect(changed).toHaveBeenCalledOnce();
  });

  it.each([
    ["PATCH", ""],
    ["DELETE", ""],
    ["PATCH", "/title"],
  ] as const)("rejects a body id overriding the URL for %s %s", async (method, suffix) => {
    const repository = createDemoRepository([
      { id: "url-task", title: "URL task", completed: false },
      { id: "body-task", title: "Body task", completed: false },
    ]);
    const before = repository.list("all");
    const changed = vi.fn();
    const response = await request(
      { repository, onTasksChanged: changed },
      `/v1/tasks/url-task${suffix}`,
      method,
      { id: "body-task", completed: true, title: "Edited" },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(repository.list("all")).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    ["PATCH", ""],
    ["DELETE", ""],
    ["PATCH", "/title"],
  ] as const)(
    "rejects a query id overriding the %s %s path without changing either task",
    async (method, suffix) => {
      const repository = createDemoRepository();
      const before = repository.list("all");
      const changed = vi.fn();
      const response = await request(
        { repository, onTasksChanged: changed },
        `/v1/tasks/explore${suffix}?id=feature`,
        method,
        method === "PATCH" ? { completed: true, title: "Edited" } : undefined,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
      expect(repository.list("all")).toEqual(before);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["PATCH", ""],
    ["DELETE", ""],
    ["PATCH", "/title"],
  ] as const)(
    "rejects malformed %s %s JSON before mutation or cache invalidation",
    async (method, suffix) => {
      const repository = createDemoRepository();
      const before = repository.list("all");
      const changed = vi.fn();
      const response = await handleOpenApiRequest(
        new Request(`http://localhost/api/v1/tasks/explore${suffix}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: '{"completed":',
        }),
        { repository, onTasksChanged: changed },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(repository.list("all")).toEqual(before);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid repository output instead of exposing it as a successful response", async () => {
    const repository: TaskRepository = {
      ...createDemoRepository(),
      list: () => [{ id: "broken", title: 42, completed: false } as unknown as Task],
    };
    const response = await request({ repository }, "/v1/tasks?status=all");

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid DELETE output instead of returning successful JSON", async () => {
    const repository: TaskRepository = {
      ...createDemoRepository(),
      delete: () => ({ id: "broken", title: 42, completed: false }) as unknown as Task,
    };
    const response = await request({ repository }, "/v1/tasks/broken", "DELETE");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid title edit output instead of returning successful JSON", async () => {
    const repository: TaskRepository = {
      ...createDemoRepository(),
      updateTitle: () => ({ id: "broken", title: 42, completed: false }) as unknown as Task,
    };
    const response = await request({ repository }, "/v1/tasks/broken/title", "PATCH", {
      title: "Edited",
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("normalizes edits at the length limit and isolates HTTP request contexts", async () => {
    const first = { repository: createDemoRepository(), onTasksChanged: vi.fn() };
    const second = { repository: createDemoRepository(), onTasksChanged: vi.fn() };
    const title = "x".repeat(120);
    const responses = await Promise.all([
      request(first, "/v1/tasks/explore/title", "PATCH", { title: `  ${title}  ` }),
      request(second, "/v1/tasks/explore/title", "PATCH", { title: "Second context" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(first.repository.list("completed")).toEqual([{ id: "explore", title, completed: true }]);
    expect(second.repository.list("completed")).toEqual([
      { id: "explore", title: "Second context", completed: true },
    ]);
    expect(first.onTasksChanged).toHaveBeenCalledOnce();
    expect(second.onTasksChanged).toHaveBeenCalledOnce();
  });

  it("keeps concurrent HTTP requests bound to their own repository and invalidator", async () => {
    const first = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const second = { repository: createDemoRepository([]), onTasksChanged: vi.fn() };
    const responses = await Promise.all([
      request(first, "/v1/tasks", "POST", { title: "First context" }),
      request(second, "/v1/tasks", "POST", { title: "Second context" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(first.repository.list("all").map((task) => task.title)).toEqual(["First context"]);
    expect(second.repository.list("all").map((task) => task.title)).toEqual(["Second context"]);
    expect(first.onTasksChanged).toHaveBeenCalledOnce();
    expect(second.onTasksChanged).toHaveBeenCalledOnce();
  });

  it("awaits the mutation's asynchronous cache invalidation before responding", async () => {
    let invalidated = false;
    const response = await request(
      {
        repository: createDemoRepository([]),
        onTasksChanged: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          invalidated = true;
        },
      },
      "/v1/tasks",
      "POST",
      { title: "Fresh task" },
    );

    expect(response.status).toBe(201);
    expect(invalidated).toBe(true);
  });

  it("returns a non-cacheable 404 for an unmatched path", async () => {
    const response = await request({ repository: createDemoRepository([]) }, "/unknown");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
