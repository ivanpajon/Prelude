import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNoteStore,
  type FixtureContext,
  fixtureRouter,
  fixtureSpecOptions,
  type NoteStore,
} from "@/testing/fixture-api";
import { POST as rpcRoutePost } from "../app/api/rpc/[[...rest]]/route";
import { createMcpEndpoint } from "./mcp";
import { createOpenApi } from "./openapi";
import { createRpc } from "./rpc";

const secret = "PRIVATE_DATABASE_PASSWORD";
const openApi = createOpenApi(fixtureRouter, fixtureSpecOptions);
const handleRpc = createRpc(fixtureRouter);

afterEach(() => vi.restoreAllMocks());

function failingStore(): NoteStore {
  return {
    ...createNoteStore(),
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

function rest(store: NoteStore, path: string, init?: RequestInit) {
  return openApi.handle(new Request(`http://localhost/api${path}`, init), { store });
}

function rpc(context: FixtureContext, path: string, body: string) {
  return handleRpc(
    new Request(`http://localhost/api/rpc/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    context,
  );
}

describe("unexpected API error logging", () => {
  it("logs a failing REST procedure once without exposing its cause", async () => {
    const logged = captureLogs();
    const response = await rest(failingStore(), "/notes?filter=all");

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
    expect(entries(logged)).toEqual([
      {
        level: "error",
        time: expect.any(String),
        message: "Unexpected API error",
        transport: "rest",
        procedure: "notes.list",
        error: { name: "Error", message: secret, stack: expect.stringContaining(secret) },
      },
    ]);
  });

  it("logs a failing RPC procedure once without exposing its cause", async () => {
    const logged = captureLogs();
    const response = await rpc(
      { store: failingStore() },
      "notes/list",
      JSON.stringify({ json: { filter: "all" } }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
    expect(entries(logged)).toMatchObject([
      { message: "Unexpected API error", transport: "rpc", procedure: "notes.list" },
    ]);
  });

  it("logs a failing MCP tool call once, through the API handler", async () => {
    const logged = captureLogs();
    const endpoint = createMcpEndpoint({
      getContext: () => ({ store: failingStore() }),
      getSpec: openApi.generateSpec,
      dispatch: openApi.handle,
    });
    const client = new Client({ name: "logging-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
          fetch: (input, init) => endpoint.fetch(new Request(input, init)),
        }),
      );
      const result = await client.callTool({ name: "listNotes", arguments: { filter: "all" } });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(entries(logged)).toMatchObject([
        { message: "Unexpected API error", transport: "rest", procedure: "notes.list" },
      ]);
    } finally {
      await client.close();
      await endpoint.close();
    }
  });

  it("logs invalid procedure output, which also becomes a 500", async () => {
    const logged = captureLogs();
    const store: NoteStore = {
      ...createNoteStore(),
      list: () => [{ id: "broken" }] as unknown as ReturnType<NoteStore["list"]>,
    };
    expect((await rest(store, "/notes?filter=all")).status).toBe(500);
    expect(entries(logged)).toMatchObject([
      {
        procedure: "notes.list",
        error: {
          message: "Output validation failed",
          cause: {
            issues: expect.arrayContaining([expect.objectContaining({ path: ["0", "text"] })]),
          },
        },
      },
    ]);
  });

  it("logs a 500 from outside a procedure call, such as generating the document", async () => {
    const logged = captureLogs();
    const broken = createOpenApi(fixtureRouter, {
      ...fixtureSpecOptions,
      filter: () => {
        throw new Error(secret);
      },
    });
    const response = await broken.handle(new Request("http://localhost/api/openapi.json"), {
      store: createNoteStore(),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
    expect(entries(logged)).toEqual([
      {
        level: "error",
        time: expect.any(String),
        message: "Unexpected API error",
        transport: "rest",
        method: "GET",
        path: "/api/openapi.json",
        error: { name: "Error", message: secret, stack: expect.stringContaining(secret) },
      },
    ]);
  });

  it("keeps expected client errors quiet", async () => {
    const logged = captureLogs();
    const store = createNoteStore();
    const json = { "Content-Type": "application/json" };

    const responses = await Promise.all([
      rest(store, "/notes?filter=unknown"),
      rest(store, "/notes/missing", { method: "DELETE" }),
      rest(store, "/notes", { method: "POST", headers: json, body: "{" }),
      rest(store, "/notes/first", { method: "PATCH", headers: json, body: '{"id":"x"}' }),
      rpc({ store }, "notes/create", JSON.stringify({ json: { text: "" } })),
      rpc({ store }, "notes/create", "{"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 404, 400, 400, 400, 400]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("serves the application's RPC route without caching an unknown procedure", async () => {
    const logged = captureLogs();
    const response = await rpcRoutePost(
      new Request("http://localhost/api/rpc/unknown/procedure", { method: "POST" }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(logged).not.toHaveBeenCalled();
  });
});
