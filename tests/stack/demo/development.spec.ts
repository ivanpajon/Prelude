import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { site } from "../../../apps/web/src/site";
import { demoLocalizationAcceptance } from "../../demo/i18n-scenarios";
import { exerciseTaskApp } from "../../demo/mcp-apps";
import { ownedContext } from "../owned-context";

demoLocalizationAcceptance();

test("runs the Spanish MCP App through the container Inspector and sandbox", async ({
  browser,
}) => {
  const inspectorOrigin = process.env.PRELUDE_STACK_INSPECTOR_URL;
  const sandboxOrigin = process.env.PRELUDE_STACK_SANDBOX_URL;
  if (!inspectorOrigin || !sandboxOrigin)
    throw new Error("Missing isolated Inspector sandbox URLs");
  const context = await browser.newContext({ locale: "es-ES" });
  try {
    await exerciseTaskApp({
      page: await context.newPage(),
      request: context.request,
      inspectorOrigin,
      sandboxOrigin,
      locale: "es",
    });
  } finally {
    await context.close();
  }
});

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

test("creates a task through the embedded development Inspector", async ({
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
  await expect(page).toHaveTitle(`${site.name} MCP Inspector`);
  const iframe = page.locator(`iframe[title="${site.name} MCP Inspector"]`);
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
  await expect(tools).toHaveAttribute("data-tool-count", "5");
  const title = `Docker Inspector ${crypto.randomUUID()}`;
  await tools.getByRole("button", { name: /createTask/ }).click();
  await tools.getByRole("textbox", { name: /^title/ }).fill(title);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  expect(await (await request.get("/api/v1/tasks?status=all")).json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ title })]),
  );
});

test("syncs workbench and MCP App changes with HMR while preserving a browser draft", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) throw new Error("Missing isolated development URL");
  const context = await ownedContext();
  const component = path.join(context, "apps/web/src/components/task-workbench.tsx");
  const stylesheet = path.join(context, "packages/ui/src/styles/globals.css");
  const theme = path.join(context, "packages/ui/src/styles/theme.css");
  const widgetCatalog = path.join(context, "packages/i18n/src/messages/en/widget.json");
  const originalComponent = await readFile(component, "utf8");
  const originalStylesheet = await readFile(stylesheet, "utf8");
  const originalTheme = await readFile(theme, "utf8");
  const originalCatalog = await readFile(widgetCatalog, "utf8");
  const marker = `Stack HMR ${crypto.randomUUID()}`;
  const themeMarker = `stack-mcp-${crypto.randomUUID()}`;
  const catalogMarker = `Translated widget ${crypto.randomUUID()}`;
  const client = new Client({ name: "prelude-stack-css-watch", version: "1.0.0" });
  const readWidgetHtml = async () => {
    const { contents } = await client.readResource({ uri: "ui://prelude/tasks.html" });
    const resource = contents[0];
    if (!resource || !("text" in resource)) throw new Error("Expected built MCP App HTML");
    return resource.text;
  };
  expect(originalComponent).toContain('{t("title")}');
  await page.goto("/playground");
  // Confirm this streamed island handles events before entering the draft.
  const density = page.getByRole("button", { name: "Compact view", exact: true });
  await density.click();
  await expect(density).toHaveAttribute("aria-pressed", "true");
  const draft = page.getByRole("textbox", { name: "New task", exact: true });
  await draft.fill("Keep my container development draft");
  await density.click();
  await expect(density).toHaveAttribute("aria-pressed", "false");
  await expect(draft).toHaveValue("Keep my container development draft");
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL)));
    expect(await readWidgetHtml()).not.toContain(themeMarker);
    await writeFile(component, originalComponent.replace('{t("title")}', marker));
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
    await writeFile(
      widgetCatalog,
      originalCatalog.replace("Your tasks, right here.", catalogMarker),
    );
    await expect.poll(readWidgetHtml).toContain(catalogMarker);
    await expect(draft).toHaveValue("Keep my container development draft");
  } finally {
    try {
      await Promise.all([
        writeFile(component, originalComponent),
        writeFile(stylesheet, originalStylesheet),
        writeFile(theme, originalTheme),
        writeFile(widgetCatalog, originalCatalog),
      ]);
    } finally {
      await client.close();
    }
  }
});
