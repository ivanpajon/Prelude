import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { apiInfo } from "../../apps/web/src/lib/api-info";
import { expectedToolNames } from "../../apps/web/src/testing/mcp-tool-names";
import { waitForHydration } from "../hydration";
import { localizationAcceptance } from "../i18n-scenarios";
import { containerNode } from "./owned-context";

localizationAcceptance();

async function listToolNames(client: Client) {
  // Tools are advertised even before the API has operations; the list is then empty.
  expect(client.getServerCapabilities()?.tools).toBeDefined();
  return (await client.listTools()).tools.map((tool) => tool.name).sort();
}

test("serves the standalone app, health, docs, MCP, and optimized images", async ({
  baseURL,
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await waitForHydration(page);
  const image = await request.get("/_next/image?url=%2Ficons%2Ficon-192.png&w=256&q=75");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\//);
  expect((await image.body()).length).toBeGreaterThan(100);
  for (const route of ["/api/health", "/api/docs", "/api/openapi.json"]) {
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
  const specification = await (await request.get("/api/openapi.json")).json();
  const client = new Client({ name: "prelude-docker-acceptance", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL)));
    expect(await listToolNames(client)).toEqual(await expectedToolNames(specification));
  } finally {
    await client.close();
  }
  expect(errors).toEqual([]);
});

test("negotiates legacy MCP in the standalone runtime", async ({ baseURL, request }) => {
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
    const specification = await (await request.get("/api/openapi.json")).json();
    expect(await listToolNames(client)).toEqual(await expectedToolNames(specification));
    expect(methods).toContain("initialize");
  } finally {
    await client.close();
  }
});

test("renders the pinned Scalar reference", async ({ page }) => {
  const script =
    "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js";
  const renderer = page.waitForResponse(script);
  await page.goto("/api/docs");
  expect((await renderer).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: apiInfo.title, exact: true })).toBeVisible();
  await expect(page.locator(`script[src="${script}"]`)).toHaveCount(1);
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
      ["/api/docs", "/api/openapi.json", "/api/health", "/api/mcp"].map(async (url) =>
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
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  const homeHeading = (await heading.textContent()) ?? "";
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
    await expect(heading).toHaveText(homeHeading);
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
