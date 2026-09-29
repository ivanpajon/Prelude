import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { exerciseTaskApp } from "../mcp-apps";
import { ownedContext } from "./owned-context";

test("serves the MCP App through the official Inspector and published sandbox port", async ({
  page,
  request,
}) => {
  const inspectorOrigin = process.env.PRELUDE_STACK_INSPECTOR_URL;
  const sandboxOrigin = process.env.PRELUDE_STACK_SANDBOX_URL;
  if (!inspectorOrigin || !sandboxOrigin)
    throw new Error("Missing isolated Inspector sandbox URLs");
  await exerciseTaskApp({ page, request, inspectorOrigin, sandboxOrigin });
});

test("does not attempt service-worker registration when the browser allows it", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing isolated development URL");
  const context = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      let registrationCalls = 0;
      Object.defineProperty(window, "stackServiceWorkerRegistrations", {
        get: () => registrationCalls,
      });
      const register = navigator.serviceWorker.register;
      navigator.serviceWorker.register = function (
        this: ServiceWorkerContainer,
        ...args: Parameters<ServiceWorkerContainer["register"]>
      ) {
        registrationCalls += 1;
        return register.apply(this, args);
      };
    });
    await page.goto("/playground");
    expect(await page.evaluate(() => "serviceWorker" in navigator)).toBe(true);
    const compact = page.getByRole("button", { name: "Compact view", exact: true });
    await compact.click();
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    // Observe provider effects after hydration, without suppressing registrations.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await page.evaluate(() => Reflect.get(window, "stackServiceWorkerRegistrations"))).toBe(
      0,
    );
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0);
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  } finally {
    await context.close();
  }
});

test("keeps Inspector authenticated and connects through the embedded development page", async ({
  baseURL,
  page,
  request,
}) => {
  const inspectorUrl = process.env.PRELUDE_STACK_INSPECTOR_URL;
  if (!inspectorUrl) throw new Error("Missing isolated Inspector URL");
  expect((await request.get(new URL("/api/servers", inspectorUrl).href)).status()).toBe(401);
  expect(
    (
      await request.get(new URL("/api/servers", inspectorUrl).href, {
        headers: { Origin: "https://unexpected.example" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/api/mcp/inspector");
  await expect(page).toHaveTitle("Prelude MCP Inspector");
  const iframe = page.locator('iframe[title="Prelude MCP Inspector"]');
  await expect(iframe).toHaveAttribute("src", `${inspectorUrl}/`);
  const inspector = iframe.contentFrame();
  await expect(
    inspector.getByText(new URL("/api/mcp", baseURL).href, { exact: true }),
  ).toBeVisible();
  const connection = inspector.getByRole("switch", { name: /Connect or disconnect/ });
  await connection.press("Space");
  await expect(connection).toBeChecked();
  await inspector.getByText("Tools", { exact: true }).click();
  const tools = inspector.getByTestId("tools-screen");
  await expect(tools).toHaveAttribute("data-tool-count", "4");
  const title = `Docker Inspector ${crypto.randomUUID()}`;
  await tools.getByRole("button", { name: /createTask/ }).click();
  await tools.getByRole("textbox", { name: /^title/ }).fill(title);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  expect(await (await request.get("/api/v1/tasks?status=all")).json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ title })]),
  );
});

test("syncs app and shared-package changes with HMR while preserving a browser draft", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) throw new Error("Missing isolated development URL");
  const context = await ownedContext();
  const component = path.join(context, "apps/web/src/components/task-workbench.tsx");
  const stylesheet = path.join(context, "packages/ui/src/styles/globals.css");
  const theme = path.join(context, "packages/ui/src/styles/theme.css");
  const originalComponent = await readFile(component, "utf8");
  const originalStylesheet = await readFile(stylesheet, "utf8");
  const originalTheme = await readFile(theme, "utf8");
  const marker = `Stack HMR ${crypto.randomUUID()}`;
  const themeMarker = `stack-mcp-${crypto.randomUUID()}`;
  const client = new Client({ name: "prelude-stack-css-watch", version: "1.0.0" });
  const readWidgetHtml = async () => {
    const { contents } = await client.readResource({ uri: "ui://prelude/tasks.html" });
    const resource = contents[0];
    if (!resource || !("text" in resource)) throw new Error("Expected built MCP App HTML");
    return resource.text;
  };
  expect(originalComponent).toContain("A small list. A working stack.");
  await page.goto("/playground");
  const draft = page.getByRole("textbox", { name: "New task", exact: true });
  await draft.fill("Keep my container development draft");
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL)));
    expect(await readWidgetHtml()).not.toContain(themeMarker);
    await writeFile(component, originalComponent.replace("A small list. A working stack.", marker));
    await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible();
    await expect(draft).toHaveValue("Keep my container development draft");
    await writeFile(stylesheet, `${originalStylesheet}\nbody { --stack-watch-probe: ready; }\n`);
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.body).getPropertyValue("--stack-watch-probe").trim(),
        ),
      )
      .toBe("ready");
    await expect(draft).toHaveValue("Keep my container development draft");
    // Compose syncs this shared token file; the separate widget watcher must rebuild it,
    // and development resource reads must observe the new HTML without a server restart.
    await writeFile(
      theme,
      `${originalTheme}\n:root { --stack-mcp-watch-probe: ${themeMarker}; }\n`,
    );
    await expect.poll(readWidgetHtml).toContain(themeMarker);
    await expect(draft).toHaveValue("Keep my container development draft");
  } finally {
    try {
      await Promise.all([
        writeFile(component, originalComponent),
        writeFile(stylesheet, originalStylesheet),
        writeFile(theme, originalTheme),
      ]);
    } finally {
      await client.close();
    }
  }
});
