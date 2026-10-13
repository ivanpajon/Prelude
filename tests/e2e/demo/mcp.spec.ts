import {
  type CallToolResult,
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { expectTaskAppResource } from "../../demo/mcp-apps";

function toolText(result: CallToolResult): unknown {
  expect(result.isError).not.toBe(true);
  const block = result.content.find((content) => content.type === "text");
  if (block?.type !== "text") throw new Error("Expected JSON text in the MCP result");
  return JSON.parse(block.text);
}

for (const mode of ["modern", "legacy"] as const) {
  test(`serves generated tools through a real ${mode} MCP client and shares writes with REST/RPC`, async ({
    baseURL,
    page,
    request,
  }) => {
    const exchanges: {
      method: string;
      cacheControl: string | null;
      sessionId: string | null;
    }[] = [];
    const client = new Client(
      { name: `prelude-${mode}-acceptance`, version: "1.0.0" },
      { versionNegotiation: { mode: mode === "modern" ? { pin: "2026-07-28" } : "legacy" } },
    );
    const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL), {
      fetch: async (input, init) => {
        const outgoing = new Request(input, init);
        const message = outgoing.method === "POST" ? await outgoing.clone().json() : undefined;
        const response = await fetch(outgoing);
        exchanges.push({
          method: message?.method ?? outgoing.method,
          cacheControl: response.headers.get("Cache-Control"),
          sessionId: response.headers.get("Mcp-Session-Id"),
        });
        return response;
      },
    });

    try {
      await client.connect(transport);
      await expectTaskAppResource(client);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "createTask",
        "deleteTask",
        "listTasks",
        "setTaskCompleted",
        "updateTaskTitle",
      ]);
      const listTool = tools.find((tool) => tool.name === "listTasks");
      expect(listTool).toMatchObject({
        inputSchema: {
          type: "object",
          required: ["status"],
          properties: {
            status: { enum: expect.arrayContaining(["all", "active", "completed"]) },
          },
        },
        annotations: { readOnlyHint: true },
      });
      expect(listTool?.outputSchema).toMatchObject(
        mode === "modern"
          ? { type: "array" }
          : { type: "object", properties: { result: { type: "array" } } },
      );
      expect(tools.find((tool) => tool.name === "setTaskCompleted")).toMatchObject({
        inputSchema: {
          type: "object",
          required: expect.arrayContaining(["id", "completed"]),
          properties: { id: { type: "string" }, completed: { type: "boolean" } },
        },
      });
      expect(tools.find((tool) => tool.name === "deleteTask")).toMatchObject({
        inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        annotations: { destructiveHint: true },
      });
      expect(tools.find((tool) => tool.name === "updateTaskTitle")).toMatchObject({
        inputSchema: {
          type: "object",
          required: expect.arrayContaining(["id", "title"]),
          properties: { id: { type: "string" }, title: { type: "string" } },
        },
      });
      const specification = await (await request.get("/api/openapi.json")).json();
      expect(specification.paths["/v1/tasks"].get.operationId).toBe(listTool?.name);

      let title = `MCP ${mode} ${crypto.randomUUID()}`;
      const createdResult = await client.callTool({
        name: "createTask",
        arguments: { title: `  ${title}  ` },
      });
      const created = toolText(createdResult) as { id: string; title: string; completed: boolean };
      expect(created).toMatchObject({ id: expect.any(String), title, completed: false });
      const completed = await client.callTool({
        name: "setTaskCompleted",
        arguments: { id: created.id, completed: true },
      });
      expect(toolText(completed)).toEqual({ ...created, completed: true });
      title = `Edited ${title}`;
      const edited = await client.callTool({
        name: "updateTaskTitle",
        arguments: { id: created.id, title: `  ${title}  ` },
      });
      expect(toolText(edited)).toEqual({ ...created, title, completed: true });
      created.title = title;
      const listed = await client.callTool({
        name: "listTasks",
        arguments: { status: "completed" },
      });
      const tasks = toolText(listed);
      expect(tasks).toEqual(expect.arrayContaining([{ ...created, completed: true }]));
      expect(listed.structuredContent).toEqual(mode === "modern" ? tasks : { result: tasks });

      const rest = await request.get("/api/v1/tasks?status=completed");
      expect(rest.ok()).toBe(true);
      expect(await rest.json()).toEqual(expect.arrayContaining([{ ...created, completed: true }]));
      await page.goto("/playground");
      await expect(
        page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
      ).toBeVisible();
      const rpc = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith("/api/rpc/"),
      );
      await page.getByRole("button", { name: "Completed", exact: true }).click();
      expect((await rpc).ok()).toBe(true);
      await expect(
        page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
      ).toBeVisible();

      const deleted = await client.callTool({ name: "deleteTask", arguments: { id: created.id } });
      expect(toolText(deleted)).toEqual({ ...created, completed: true });
      expect(await (await request.get("/api/v1/tasks?status=all")).json()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.id })]),
      );
      await page.reload();
      await expect(
        page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
      ).toHaveCount(0);
      const missing = await client.callTool({ name: "deleteTask", arguments: { id: created.id } });
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.content)).toContain("NOT_FOUND");
      const missingEdit = await client.callTool({
        name: "updateTaskTitle",
        arguments: { id: created.id, title: "Cannot edit a deleted task" },
      });
      expect(missingEdit.isError).toBe(true);
      expect(JSON.stringify(missingEdit.content)).toContain("NOT_FOUND");

      expect(exchanges.map((exchange) => exchange.method)).toContain(
        mode === "modern" ? "server/discover" : "initialize",
      );
      if (mode === "modern")
        expect(exchanges.map((exchange) => exchange.method)).not.toContain("initialize");
      expect(exchanges.length).toBeGreaterThan(3);
      for (const exchange of exchanges) {
        expect(exchange.cacheControl).toBe("no-store");
        expect(exchange.sessionId).toBeNull();
      }
    } finally {
      await client.close();
    }
  });
}
