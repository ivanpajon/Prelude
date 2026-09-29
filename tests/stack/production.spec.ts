import {
  type CallToolResult,
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { containerNode } from "./owned-context";

function toolText(result: CallToolResult): unknown {
  expect(result.isError).not.toBe(true);
  const block = result.content.find((content) => content.type === "text");
  if (block?.type !== "text") throw new Error("Expected JSON text in the MCP result");
  return JSON.parse(block.text);
}

test("serves the standalone app, REST, MCP, docs, and optimized images", async ({
  baseURL,
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Move to end", exact: true }).click();
  await expect(page.getByText("Tile at the end.", { exact: true })).toBeVisible();
  const playground = page.getByRole("region", {
    name: "A little input. Real action.",
    exact: true,
  });
  await playground.getByRole("button", { name: "Discover tools", exact: true }).click();
  await expect(playground.getByRole("group", { name: "MCP tools" })).toBeVisible();
  await playground.getByRole("button", { name: "listTasks", exact: true }).click();
  await playground.getByRole("textbox", { name: "Arguments JSON" }).fill('{"status":"all"}');
  await playground.getByRole("button", { name: "Run tool", exact: true }).click();
  await expect(playground.getByRole("region", { name: "Response", exact: true })).toContainText(
    "Explore the workspace",
  );
  const image = await request.get("/_next/image?url=%2Fbranding%2Fprelude-logo.png&w=256&q=75");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\//);
  expect((await image.body()).length).toBeGreaterThan(100);
  for (const route of ["/api/docs", "/api/openapi.json"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const inspectorHeaders: Record<string, string>[] = [
    {},
    {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "X-Forwarded-Host": "localhost:3000",
      "X-Forwarded-Proto": "http",
    },
  ];
  for (const route of [
    "/api/mcp/inspector",
    "/api/mcp/inspector/api/servers",
    "/api/mcp/inspector/assets/index.js",
  ]) {
    for (const headers of inspectorHeaders) {
      const response = await request.get(route, { headers });
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe("no-store");
    }
  }
  const client = new Client({ name: "prelude-docker-acceptance", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL)));
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      "createTask",
      "listTasks",
      "setTaskCompleted",
    ]);
    const title = `Container ${crypto.randomUUID()}`;
    const created = await client.callTool({ name: "createTask", arguments: { title } });
    expect(created.isError).not.toBe(true);
    expect(await (await request.get("/api/v1/tasks?status=all")).json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ title })]),
    );
    await page.reload();
    await expect(page.getByRole("list", { name: "Tasks" }).getByText(title)).toBeVisible();
  } finally {
    await client.close();
  }
  expect(errors).toEqual([]);
});

test("creates and completes tasks through the browser RPC transport", async ({ page, request }) => {
  const title = `Container RPC ${crypto.randomUUID()}`;
  await page.goto("/");
  await page.getByRole("textbox", { name: "New task", exact: true }).fill(title);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/rpc/tasks/create" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  expect((await created).ok()).toBe(true);
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New task", exact: true })).toHaveValue("");

  const completed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/rpc/tasks/setCompleted" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: `Mark ${title} as completed`, exact: true }).click();
  expect((await completed).ok()).toBe(true);
  const checkbox = page.getByRole("button", { name: `Mark ${title} as active`, exact: true });
  await expect(checkbox).toHaveAttribute("aria-pressed", "true");
  expect(await (await request.get("/api/v1/tasks?status=completed")).json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ title, completed: true })]),
  );
  await page.reload();
  await expect(checkbox).toHaveAttribute("aria-pressed", "true");
});

test("negotiates legacy MCP and executes every generated tool in the standalone runtime", async ({
  baseURL,
  request,
}) => {
  const methods: string[] = [];
  const client = new Client(
    { name: "prelude-docker-legacy", version: "1.0.0" },
    { versionNegotiation: { mode: "legacy" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL), {
    fetch: async (input, init) => {
      const outgoing = new Request(input, init);
      if (outgoing.method === "POST") {
        const message = await outgoing.clone().json();
        if (typeof message.method === "string") methods.push(message.method);
      }
      return fetch(outgoing);
    },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "createTask",
      "listTasks",
      "setTaskCompleted",
    ]);
    expect(tools.find((tool) => tool.name === "listTasks")?.outputSchema).toMatchObject({
      type: "object",
      properties: { result: { type: "array" } },
    });
    const title = `Container legacy ${crypto.randomUUID()}`;
    const created = toolText(
      await client.callTool({ name: "createTask", arguments: { title } }),
    ) as { id: string; title: string; completed: boolean };
    expect(created).toMatchObject({ id: expect.any(String), title, completed: false });
    const completed = await client.callTool({
      name: "setTaskCompleted",
      arguments: { id: created.id, completed: true },
    });
    expect(toolText(completed)).toEqual({ ...created, completed: true });
    const listed = await client.callTool({ name: "listTasks", arguments: { status: "completed" } });
    const tasks = toolText(listed);
    expect(tasks).toEqual(expect.arrayContaining([{ ...created, completed: true }]));
    expect(listed.structuredContent).toEqual({ result: tasks });
    expect(methods).toContain("initialize");
    expect(await (await request.get("/api/v1/tasks?status=completed")).json()).toEqual(
      expect.arrayContaining([{ ...created, completed: true }]),
    );
  } finally {
    await client.close();
  }
});

test("renders pinned Scalar and executes a same-origin read", async ({ page }) => {
  const script =
    "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js";
  const renderer = page.waitForResponse(script);
  await page.goto("/api/docs");
  expect((await renderer).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Prelude API", exact: true })).toBeVisible();
  await expect(page.locator(`script[src="${script}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: "Test Request (get /v1/tasks)", exact: true }).click();
  const client = page.getByRole("dialog", { name: "API Client", exact: true });
  const origin = new URL(page.url()).origin;
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).origin === origin && new URL(result.url()).pathname === "/api/v1/tasks",
  );
  await client.getByRole("button", { name: /^Send get request to/ }).click();
  expect((await response).status()).toBe(200);
  await expect(client.getByRole("link", { name: "200 OK", exact: true })).toBeVisible();
});

test("keeps API responses out of the PWA cache and serves its offline fallback", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-store");
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async () => {
    await Promise.all(
      ["/api/docs", "/api/openapi.json", "/api/v1/tasks?status=all", "/api/mcp"].map(async (url) =>
        (await fetch(url)).text(),
      ),
    );
    await fetch("/offline?_rsc=stack-check", { headers: { RSC: "1" } });
  });
  const cached = await page.evaluate(async () => {
    const entries = await Promise.all(
      (await caches.keys()).map(async (name) => (await caches.open(name)).keys()),
    );
    return entries.flat().map((entry) => entry.url);
  });
  expect(cached.some((url) => new URL(url).pathname === "/offline")).toBe(true);
  for (const value of cached) {
    const url = new URL(value);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("_rsc")).toBe(false);
    expect(url.pathname).not.toBe("/");
  }
  await context.setOffline(true);
  await page.goto("/stack-offline-fallback");
  await expect(page.getByRole("heading", { name: "You’re offline." })).toBeVisible();
  await context.setOffline(false);
});

test("activates a replacement worker only after approval in the running container", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const token = crypto.randomUUID();
  const marker = `\n// isolated-stack-update-${token}\n`;
  containerNode(`
    const fs = require('node:fs'); const path = require('node:path');
    const file = path.resolve('apps/web/public/sw.js');
    fs.appendFileSync(file, ${JSON.stringify(marker)});
  `);
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const update = page.getByRole("button", { name: "Update now", exact: true });
    await expect(update).toBeVisible();
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state),
    ).toBe("installed");
    const reload = page.waitForEvent("load");
    await update.click();
    await reload;
    await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
    await expect(update).toBeHidden();
  } finally {
    containerNode(`
      const fs = require('node:fs'); const path = require('node:path');
      const file = path.resolve('apps/web/public/sw.js');
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, text.replace(${JSON.stringify(marker)}, ''));
    `);
  }
});
