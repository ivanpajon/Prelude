import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  type CallToolResult,
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { expectTaskAppResource } from "../mcp-apps";

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
        "listTasks",
        "setTaskCompleted",
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
      const specification = await (await request.get("/api/openapi.json")).json();
      expect(specification.paths["/v1/tasks"].get.operationId).toBe(listTool?.name);

      const title = `MCP ${mode} ${crypto.randomUUID()}`;
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

test("keeps the stateless MCP route uncached, rejects unexpected browser origins, and omits production Inspector", async ({
  request,
}) => {
  for (const method of ["GET", "DELETE"]) {
    const response = await request.fetch("/api/mcp", { method });
    expect(response.status()).toBe(405);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const rejected = await request.post("/api/mcp", {
    headers: {
      Origin: "https://unexpected.example",
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });
  expect(rejected.status()).toBe(403);
  expect(rejected.headers()["cache-control"]).toBe("no-store");
  for (const path of [
    "/api/mcp/inspector",
    "/api/mcp/inspector/api/servers",
    "/api/mcp/inspector/assets/index.js",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("disables MCP at production runtime without rebuilding or disabling REST", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No free loopback port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    reservation.close((error) => (error ? reject(error) : resolve()));
  });
  const appDirectory = fileURLToPath(new URL("../../apps/web/", import.meta.url));
  const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
  const child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: appDirectory,
      env: { ...process.env, NODE_ENV: "production", MCP_ENABLED: "false" },
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  let launchError: Error | undefined;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", (error) => {
      launchError = error;
      resolve();
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await expect
      .poll(
        async () => {
          if (launchError) throw launchError;
          if (child.exitCode !== null)
            throw new Error(`Disabled MCP server exited: ${child.exitCode}`);
          try {
            return (
              await fetch(`${origin}/api/v1/tasks?status=all`, {
                signal: AbortSignal.timeout(1000),
              })
            ).status;
          } catch {
            return 0;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(200);
    const disabled = await fetch(`${origin}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("Cache-Control")).toBe("no-store");
    expect((await fetch(`${origin}/api/mcp/inspector`)).status).toBe(404);
    await page.goto(new URL("/playground", origin).href);
    const widget = page.getByRole("region", { name: "A little input. Real action.", exact: true });
    await widget.getByRole("button", { name: "Discover tools", exact: true }).click();
    await expect(widget.getByRole("alert")).toContainText("MCP is disabled for this application.");
    await expect(widget.getByRole("button", { name: "Run tool", exact: true })).toHaveCount(0);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32") {
        // Only terminate the PID spawned by this test, never a process found by its port.
        execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
          timeout: 10_000,
        });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
      await Promise.race([
        exited,
        delay(5000, undefined, { ref: false }).then(() => {
          if (child.pid && child.exitCode === null && child.signalCode === null) {
            if (process.platform === "win32") child.kill("SIGKILL");
            else process.kill(-child.pid, "SIGKILL");
          }
        }),
      ]);
    }
  }
});
