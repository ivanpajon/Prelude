import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createDemoRepository, demoRepository, type TaskRepository } from "@repo/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as rpcPost } from "../app/api/rpc/[[...rest]]/route";
import { createMcpEndpoint } from "./mcp";
import { generateOpenApiSpec, handleOpenApiRequest } from "./openapi";

const secret = "PRIVATE_DATABASE_PASSWORD";

afterEach(() => vi.restoreAllMocks());

function failingRepository(): TaskRepository {
  return {
    ...createDemoRepository([]),
    list: () => {
      throw new Error(secret);
    },
  };
}

function captureLogs() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

function entries(logged: ReturnType<typeof captureLogs>) {
  return logged.mock.calls.map(([line]) => JSON.parse(String(line)));
}

function rest(repository: TaskRepository, path: string, init?: RequestInit) {
  return handleOpenApiRequest(new Request(`http://localhost/api${path}`, init), { repository });
}

function rpc(path: string, body: string) {
  return rpcPost(
    new Request(`http://localhost/api/rpc/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

describe("unexpected task API error logging", () => {
  it("logs a failing REST procedure once without exposing its cause", async () => {
    const logged = captureLogs();
    const response = await rest(failingRepository(), "/v1/tasks?status=all");

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
    expect(entries(logged)).toEqual([
      {
        level: "error",
        time: expect.any(String),
        message: "Unexpected API error",
        transport: "rest",
        procedure: "tasks.list",
        error: { name: "Error", message: secret, stack: expect.stringContaining(secret) },
      },
    ]);
  });

  it("logs a failing RPC procedure once without exposing its cause", async () => {
    const logged = captureLogs();
    vi.spyOn(demoRepository, "list").mockImplementation(() => {
      throw new Error(secret);
    });
    const response = await rpc("tasks/list", JSON.stringify({ json: { status: "all" } }));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
    expect(entries(logged)).toMatchObject([
      { message: "Unexpected API error", transport: "rpc", procedure: "tasks.list" },
    ]);
  });

  it("logs a failing MCP tool call once, through the API handler", async () => {
    const logged = captureLogs();
    const endpoint = createMcpEndpoint({
      getContext: () => ({ repository: failingRepository() }),
      getSpec: generateOpenApiSpec,
      dispatch: handleOpenApiRequest,
    });
    const client = new Client({ name: "logging-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
          fetch: (input, init) => endpoint.fetch(new Request(input, init)),
        }),
      );
      const result = await client.callTool({ name: "listTasks", arguments: { status: "all" } });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(entries(logged)).toMatchObject([
        { message: "Unexpected API error", transport: "rest", procedure: "tasks.list" },
      ]);
    } finally {
      await client.close();
      await endpoint.close();
    }
  });

  it("logs invalid procedure output, which also becomes a 500", async () => {
    const logged = captureLogs();
    const repository: TaskRepository = {
      ...createDemoRepository([]),
      list: () => [{ id: "broken" }] as unknown as ReturnType<TaskRepository["list"]>,
    };
    expect((await rest(repository, "/v1/tasks?status=all")).status).toBe(500);
    expect(entries(logged)).toMatchObject([{ procedure: "tasks.list" }]);
  });

  it("keeps expected client errors quiet", async () => {
    const logged = captureLogs();
    const repository = createDemoRepository([]);
    const json = { "Content-Type": "application/json" };

    const responses = await Promise.all([
      rest(repository, "/v1/tasks?status=unknown"),
      rest(repository, "/v1/tasks/missing", { method: "DELETE" }),
      rest(repository, "/v1/tasks", { method: "POST", headers: json, body: "{" }),
      rpc("tasks/create", JSON.stringify({ json: { title: "" } })),
      rpc("tasks/create", "{"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 404, 400, 400, 400]);
    expect(logged).not.toHaveBeenCalled();
  });
});
