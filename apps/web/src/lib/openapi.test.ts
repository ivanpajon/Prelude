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
        },
      },
    });
    expect(Object.keys(spec.paths ?? {}).sort()).toEqual(["/v1/tasks", "/v1/tasks/{id}"]);
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
  it("creates normalized tasks, patches completion, and filters the shared RPC data", async () => {
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
    expect(context.onTasksChanged).toHaveBeenCalledTimes(2);
    expect(create.headers.get("Cache-Control")).toBe("no-store");
    expect(active.headers.get("Cache-Control")).toBe("no-store");
    expect(update.headers.get("Cache-Control")).toBe("no-store");
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

  it("returns the typed missing-task error without invalidating caches", async () => {
    const changed = vi.fn();
    const response = await request(
      { repository: createDemoRepository([]), onTasksChanged: changed },
      "/v1/tasks/missing",
      "PATCH",
      { completed: true },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND", message: "Task not found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects a body id that would otherwise override the task id in the URL", async () => {
    const repository = createDemoRepository([
      { id: "url-task", title: "URL task", completed: false },
      { id: "body-task", title: "Body task", completed: false },
    ]);
    const before = repository.list("all");
    const changed = vi.fn();
    const response = await request(
      { repository, onTasksChanged: changed },
      "/v1/tasks/url-task",
      "PATCH",
      { id: "body-task", completed: true },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(repository.list("all")).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before updating a task or invalidating caches", async () => {
    const repository = createDemoRepository();
    const before = repository.list("all");
    const changed = vi.fn();
    const response = await handleOpenApiRequest(
      new Request("http://localhost/api/v1/tasks/explore", {
        method: "PATCH",
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
  });

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
