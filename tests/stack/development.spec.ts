import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ownedContext } from "./owned-context";

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
    await page.goto("/");
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
  await expect(tools).toHaveAttribute("data-tool-count", "3");
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
  page,
}) => {
  const context = await ownedContext();
  const component = path.join(context, "apps/web/src/components/animation-examples.tsx");
  const stylesheet = path.join(context, "packages/ui/src/styles/globals.css");
  const originalComponent = await readFile(component, "utf8");
  const originalStylesheet = await readFile(stylesheet, "utf8");
  const marker = `Stack HMR ${crypto.randomUUID()}`;
  expect(originalComponent).toContain("Small details. More life.");
  await page.goto("/");
  const draft = page.getByRole("textbox", { name: "New task", exact: true });
  await draft.fill("Keep my container development draft");
  try {
    await writeFile(component, originalComponent.replace("Small details. More life.", marker));
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
  } finally {
    await writeFile(component, originalComponent);
    await writeFile(stylesheet, originalStylesheet);
  }
});
