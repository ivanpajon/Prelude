import { InMemoryTransport, type JSONRPCMessage } from "@modelcontextprotocol/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { afterEach, expect, it } from "vitest";
import { callHostTool } from "./bridge";
import { readTasks } from "./model";

const task = { id: "task-1", title: "Build something", completed: false };
const apps: App[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function connectHost(result: Record<string, unknown>) {
  const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair();
  const messages: JSONRPCMessage[] = [];
  const app = new App({ name: "Prelude test", version: "1.0.0" }, {}, { autoResize: false });
  apps.push(app);

  // A raw host peer preserves the actual wire shape. A second MCP Protocol
  // instance would project natural arrays into its default legacy envelope.
  hostTransport.onmessage = (message) => {
    messages.push(message);
    if (!("id" in message) || !("method" in message)) return;
    void hostTransport.send({
      jsonrpc: "2.0",
      id: message.id,
      result:
        message.method === "ui/initialize"
          ? {
              protocolVersion: "2026-01-26",
              hostInfo: { name: "Test host", version: "1.0.0" },
              hostCapabilities: {},
              hostContext: { theme: "light" },
            }
          : result,
    });
  };
  await hostTransport.start();
  await app.connect(appTransport);
  return { app, messages };
}

it.each([
  ["modern natural array", [task]],
  ["legacy wrapped array", { result: [task] }],
] as const)("accepts a %s after the real Apps handshake", async (_name, structuredContent) => {
  const wireResult = {
    content: [{ type: "text", text: JSON.stringify([task]) }],
    structuredContent,
  };
  const { app, messages } = await connectHost(wireResult);
  const result = await callHostTool(
    app,
    "renamed-list-tasks",
    { status: "active" },
    new AbortController().signal,
  );

  expect(result).toEqual(wireResult);
  expect(readTasks(result)).toEqual([task]);
  expect(messages.map((message) => ("method" in message ? message.method : undefined))).toEqual([
    "ui/initialize",
    "ui/notifications/initialized",
    "tools/call",
  ]);
  expect(messages[2]).toMatchObject({
    method: "tools/call",
    params: { name: "renamed-list-tasks", arguments: { status: "active" } },
  });
});

it("still rejects malformed tool-result content through the real SDK validator", async () => {
  const { app } = await connectHost({
    content: [{ type: "text", text: 123 }],
    structuredContent: [task],
  });
  await expect(
    callHostTool(app, "listTasks", { status: "all" }, new AbortController().signal),
  ).rejects.toThrow();
});

it("preserves valid tool errors for the widget's error handling", async () => {
  const wireResult = {
    isError: true,
    content: [{ type: "text", text: "The task repository is unavailable." }],
  };
  const { app } = await connectHost(wireResult);
  const result = await callHostTool(
    app,
    "listTasks",
    { status: "all" },
    new AbortController().signal,
  );
  expect(result).toEqual(wireResult);
  expect(() => readTasks(result)).toThrow("The tool could not complete the request.");
});
