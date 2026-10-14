import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { site } from "../../apps/web/src/site";
import { expectedToolNames } from "../../apps/web/src/testing/mcp-tool-names";
import { localizationAcceptance } from "../i18n-scenarios";
import { ownedContext } from "./owned-context";

localizationAcceptance();

test("does not attempt service-worker registration when the browser allows it", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
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
    await page.getByRole("button", { name: "Save idea", exact: true }).click();
    await expect(page.getByRole("button", { name: "Idea saved", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
  const names = await expectedToolNames(await (await request.get("/api/openapi.json")).json());
  // The Tools screen also opens for an API without operations; it then lists none.
  await inspector.getByText("Tools", { exact: true }).click();
  const tools = inspector.getByTestId("tools-screen");
  await expect(tools).toHaveAttribute("data-tool-count", String(names.length));
});

test("syncs app and shared-package changes with HMR while preserving browser state", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) throw new Error("Missing isolated development URL");
  const context = await ownedContext();
  const component = path.join(context, "apps/web/src/components/site-footer.tsx");
  const stylesheet = path.join(context, "packages/ui/src/styles/globals.css");
  const originalComponent = await readFile(component, "utf8");
  const originalStylesheet = await readFile(stylesheet, "utf8");
  const marker = `Stack HMR ${crypto.randomUUID()}`;
  expect(originalComponent).toContain('{t("footer")}');
  await page.goto("/");
  // Confirm the client island handles events before relying on its state.
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  const saved = page.getByRole("button", { name: "Idea saved", exact: true });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  try {
    await writeFile(component, originalComponent.replace('{t("footer")}', marker));
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await writeFile(stylesheet, `${originalStylesheet}\nbody { --stack-watch-probe: ready; }\n`);
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.body).getPropertyValue("--stack-watch-probe").trim(),
        ),
      )
      .toBe("ready");
    await expect(saved).toHaveAttribute("aria-pressed", "true");
  } finally {
    await Promise.all([
      writeFile(component, originalComponent),
      writeFile(stylesheet, originalStylesheet),
    ]);
  }
});
