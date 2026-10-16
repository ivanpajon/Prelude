import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ROUTING_DEMO_ENABLED } from "../../apps/web/src/i18n/routing-settings";
import { site } from "../../apps/web/src/site";
import { waitForHydration } from "../hydration";
import { documentMark, homeLinkName, markDocument } from "../page-state";
import {
  cachedUrls,
  fetchFailures,
  fetchFromPage,
  trackDocumentNavigations,
  waitForWorker,
  withWorkerRevisions,
} from "./pwa-helpers";

/** Reads the home page's level-1 heading, to recognize the page after it loads again. */
async function homeHeading(page: Page) {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  return (await heading.textContent()) ?? "";
}

test("localizes waiting updates and the precached fallback without network translations", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "es-ES" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await waitForWorker(page);
    await withWorkerRevisions(async (publish) => {
      await publish(page, "spanish");
      await expect(page.getByText("Actualización disponible", { exact: true })).toBeVisible();
      // Cache Components retains hidden locale trees; assert the active notification.
      const notice = page.locator('[data-slot="toast"]:visible');
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute("data-toast-id", "pwa-update");
      await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
      await expect(notice.getByText("Update available", { exact: true })).toBeVisible();
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute("data-toast-id", "pwa-update");
      // routingSettings.demoEnabled: false removes the Language in URL switch, so its steps run
      // only when the header shows it.
      if (ROUTING_DEMO_ENABLED) {
        await page.evaluate(() => {
          Reflect.set(window, "routingUpdateController", navigator.serviceWorker.controller);
        });
        // The notice covers the right side of the header, so toggle the switch with the keyboard.
        await page.getByRole("switch", { name: "Language in URL", exact: true }).focus();
        await page.keyboard.press("Space");
        await expect(page).toHaveURL((url) => url.pathname === "/");
        await expect(notice).toHaveCount(1);
        await expect(notice.getByText("Update available", { exact: true })).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              navigator.serviceWorker.controller === Reflect.get(window, "routingUpdateController"),
          ),
        ).toBe(true);
      }
      await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(notice).toHaveCount(0);
      if (ROUTING_DEMO_ENABLED) {
        await page.getByRole("switch", { name: "Idioma en la URL", exact: true }).click();
        await expect(page).toHaveURL((url) => url.pathname === "/es");
        await expect(notice).toHaveCount(0);
      }
      await context.setOffline(true);
      await page.goto("/not-available-offline");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("No tienes conexión.");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page).toHaveTitle(`Sin conexión — ${site.name}`);
      expect(
        (await cachedUrls(page)).some(
          (value) => new URL(value).pathname === "/manifest.webmanifest",
        ),
      ).toBe(false);
    });
  } finally {
    await context.close();
  }
});

test("publishes an installable manifest and valid installation icons", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  for (const size of [192, 512]) {
    const icon = await request.get(`/icons/icon-${size}.png`);
    expect(icon.ok()).toBe(true);
    const png = await icon.body();
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const worker = await request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  // Pages load Next.js polyfills with <script noModule>, so the worker must not precache them.
  const { polyfillFiles } = JSON.parse(
    readFileSync(new URL("../../apps/web/.next/build-manifest.json", import.meta.url), "utf8"),
  ) as { polyfillFiles: string[] };
  expect(polyfillFiles.length).toBeGreaterThan(0);
  const workerSource = await worker.text();
  for (const file of polyfillFiles) expect(workerSource).not.toContain(`/_next/${file}`);
});

test("shows an offline fallback without caching API responses, pages, or RSC", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForWorker(page);
  // Navigate once under worker control so document caching would show up in Cache Storage.
  await page.reload();
  const heading = await homeHeading(page);
  const apiPaths = ["/api/docs", "/api/openapi.json", "/api/health", "/api/mcp"];
  expect(await fetchFromPage(page, apiPaths)).toEqual(
    apiPaths.map((path) => ({
      path,
      status: path === "/api/mcp" ? 405 : 200,
      cacheControl: "no-store",
    })),
  );
  await waitForHydration(page);
  await page.evaluate(async () => {
    await fetch("/offline?_rsc=cache-boundary-check", { headers: { RSC: "1" } });
  });
  const cached = await cachedUrls(page);
  expect(cached.some((value) => new URL(value).pathname === "/offline")).toBe(true);
  expect(cached.some((value) => new URL(value).pathname.startsWith("/_next/static/"))).toBe(true);
  for (const value of cached) {
    const url = new URL(value);
    expect(url.pathname).not.toBe("/");
    expect(url.pathname).not.toMatch(/^\/(en|es)(?:\/|$)/);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("_rsc")).toBe(false);
  }
  await context.setOffline(true);
  expect(await fetchFailures(page, apiPaths)).toEqual(apiPaths.map(() => true));
  await page.goto("/never-visited-offline-page");
  await expect(page.getByRole("heading", { name: "You’re offline." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
});

test("keeps the first service-worker installation quiet", async ({ page }) => {
  await page.goto("/");
  await waitForWorker(page);
  await expect(page.getByText("Update available", { exact: true })).toBeHidden();
  await expect(page.getByText("Update ready", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Dismiss notification" })).toBeHidden();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
  ).toBe(true);
});

for (const width of [1280, 320]) {
  test(`approves a real update by keyboard and reloads once at ${width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 800 });
    if (width === 320) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const heading = await homeHeading(page);
    await waitForWorker(page);
    const navigations = trackDocumentNavigations(page);

    await withWorkerRevisions(async (publish) => {
      await publish(page, `keyboard-${width}`);
      const title = page.getByText("Update available", { exact: true });
      const description = page.getByText(
        "A new version is ready. Update now to reload this page.",
        { exact: true },
      );
      const update = page.getByRole("button", { name: "Update now", exact: true });
      const dismiss = page.getByRole("button", { name: "Dismiss notification", exact: true });
      const toast = page.locator('[data-slot="toast"]').filter({ has: update });
      await expect(title).toHaveCount(1);
      await expect(title).toBeVisible();
      await expect(description).toBeVisible();
      await expect(update).toBeVisible();
      await expect(dismiss).toBeVisible();
      expect(navigations).toEqual({ requests: 0, loads: 0 });
      expect(
        await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return registration.waiting?.state === "installed";
        }),
      ).toBe(true);

      for (const element of [toast, title, description, update, dismiss]) {
        const bounds = await element.boundingBox();
        expect(bounds).not.toBeNull();
        if (!bounds) throw new Error("The update notification is not rendered");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      expect((await title.boundingBox())?.y).toBeLessThan(120);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: test.info().outputPath("update-toast.png"),
        animations: "disabled",
      });

      await update.focus();
      await expect(update).toBeFocused();
      const reload = page.waitForEvent("load");
      await page.keyboard.press("Enter");
      await reload;
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("link", { name: homeLinkName.en, exact: true })).toBeVisible();
      await waitForWorker(page);
      await expect(title).toBeHidden();
      await expect(update).toBeHidden();
      expect(navigations).toEqual({ requests: 1, loads: 1 });
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
      ).toBe(true);
    });
  });
}

test("keeps another tab's state until that tab approves its own reload", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await waitForWorker(page);
  const second = await context.newPage();
  await second.goto("/");
  await waitForWorker(second);
  await waitForHydration(second);
  // The mark is this tab's client state; only a reload of the tab clears it.
  const mark = await markDocument(second);
  const secondNavigations = trackDocumentNavigations(second);

  await withWorkerRevisions(async (publish) => {
    await publish(page, "two-tabs");
    await expect(page.getByRole("button", { name: "Update now", exact: true })).toBeVisible();
    await expect(second.getByRole("button", { name: "Update now", exact: true })).toBeVisible();
    const firstReload = page.waitForEvent("load");
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    await firstReload;

    await expect(second.getByText("Update ready", { exact: true })).toBeVisible();
    await expect(second.getByRole("button", { name: "Reload now", exact: true })).toBeVisible();
    expect(await documentMark(second)).toBe(mark);
    expect(secondNavigations).toEqual({ requests: 0, loads: 0 });
    expect(
      await second.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
    ).toBe(true);

    const secondReload = second.waitForEvent("load");
    await second.getByRole("button", { name: "Reload now", exact: true }).click();
    await secondReload;
    expect(await documentMark(second)).toBeUndefined();
    await expect(second.getByText("Update ready", { exact: true })).toBeHidden();
    expect(secondNavigations).toEqual({ requests: 1, loads: 1 });
  });
});

test("dismisses an update by swipe and offers a newer waiting worker", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await waitForWorker(page);

  await withWorkerRevisions(async (publish) => {
    await publish(page, "dismissed");
    const title = page.getByText("Update available", { exact: true });
    const update = page.getByRole("button", { name: "Update now", exact: true });
    await expect(update).toBeVisible();
    const bounds = await title.boundingBox();
    if (!bounds) throw new Error("The update notification title is not rendered");
    const startX = bounds.x + Math.min(bounds.width / 2, 40);
    const startY = bounds.y + bounds.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 240, startY, { steps: 12 });
    await page.mouse.up();
    await expect(title).toBeHidden();
    await expect(update).toBeHidden();

    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state),
    ).toBe("installed");

    await publish(page, "newer");
    await expect(title).toHaveCount(1);
    await expect(title).toBeVisible();
    await expect(update).toBeVisible();
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state),
    ).toBe("installed");
  });
});
