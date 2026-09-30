import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

async function waitForWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

async function checkForUpdate(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
}

test("localizes waiting updates and the precached fallback without network translations", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing production URL");
  const context = await browser.newContext({ locale: "es-ES", serviceWorkers: "allow", baseURL });
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
      await page.evaluate(() => {
        Reflect.set(window, "routingUpdateController", navigator.serviceWorker.controller);
      });
      await page.getByRole("switch", { name: "Language in URL", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(notice).toHaveCount(1);
      await expect(notice.getByText("Update available", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            navigator.serviceWorker.controller === Reflect.get(window, "routingUpdateController"),
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(notice).toHaveCount(0);
      await page.getByRole("switch", { name: "Idioma en la URL", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/es");
      await expect(notice).toHaveCount(0);
      await context.setOffline(true);
      await page.goto("/not-available-offline");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("No tienes conexión.");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page).toHaveTitle("Sin conexión — Prelude");
      expect(
        await page.evaluate(async () => {
          const entries = await Promise.all(
            (await caches.keys()).map(async (name) => (await caches.open(name)).keys()),
          );
          return entries
            .flat()
            .some((request) => new URL(request.url).pathname === "/manifest.webmanifest");
        }),
      ).toBe(false);
    });
  } finally {
    await context.close();
  }
});

function trackDocumentNavigations(page: Page) {
  const counts = { requests: 0, loads: 0 };
  // Next.js history synchronization can also emit framenavigated without a reload.
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      !request.serviceWorker() &&
      request.frame() === page.mainFrame()
    ) {
      counts.requests++;
    }
  });
  page.on("load", () => counts.loads++);
  return counts;
}

async function withWorkerRevisions(
  run: (publish: (page: Page, revision: string) => Promise<void>) => Promise<void>,
) {
  const workerPath = fileURLToPath(new URL("../../apps/web/public/sw.js", import.meta.url));
  const original = await readFile(workerPath);
  try {
    await run(async (page, revision) => {
      await writeFile(
        workerPath,
        Buffer.concat([original, Buffer.from(`\n// update-test-${revision}-${Date.now()}\n`)]),
      );
      await checkForUpdate(page);
    });
  } finally {
    await writeFile(workerPath, original);
  }
}

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
});

test("shows an offline fallback without caching API docs, application data, or RSC", async ({
  page,
  context,
}) => {
  await page.goto("/playground");
  await waitForWorker(page);
  const apiPaths = ["/api/docs", "/api/openapi.json", "/api/v1/tasks?status=all", "/api/mcp"];
  const apiResponses = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path);
          await response.text();
          return {
            path,
            status: response.status,
            cacheControl: response.headers.get("Cache-Control"),
          };
        }),
      ),
    apiPaths,
  );
  expect(apiResponses).toEqual(
    apiPaths.map((path) => ({
      path,
      status: path === "/api/mcp" ? 405 : 200,
      cacheControl: "no-store",
    })),
  );
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(async () => {
    await fetch("/offline?_rsc=cache-boundary-check", { headers: { RSC: "1" } });
  });
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((value) => new URL(value).pathname === "/offline")).toBe(true);
  expect(cachedUrls.some((value) => new URL(value).pathname.startsWith("/_next/static/"))).toBe(
    true,
  );
  for (const value of cachedUrls) {
    const url = new URL(value);
    expect(url.pathname).not.toBe("/");
    expect(url.pathname).not.toBe("/playground");
    expect(url.pathname).not.toMatch(/^\/(en|es)(?:\/|$)/);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("_rsc")).toBe(false);
  }
  await context.setOffline(true);
  const offlineApiRejected = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          try {
            await fetch(path);
            return false;
          } catch {
            return true;
          }
        }),
      ),
    apiPaths,
  );
  expect(offlineApiRejected).toEqual(apiPaths.map(() => true));
  await page.goto("/never-visited-offline-page");
  await expect(page.getByRole("heading", { name: "You’re offline." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Open playground", exact: true })).toBeVisible();
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
      await expect(page.getByRole("link", { name: "Open playground", exact: true })).toBeVisible();
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

test("keeps another tab's draft until that tab approves its own reload", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await waitForWorker(page);
  const second = await context.newPage();
  await second.goto("/playground");
  await waitForWorker(second);
  const draft = second.getByRole("textbox", { name: "New task", exact: true });
  await expect(draft).toBeVisible();
  await draft.fill("Keep this unfinished idea");
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
    await expect(draft).toHaveValue("Keep this unfinished idea");
    expect(secondNavigations).toEqual({ requests: 0, loads: 0 });
    expect(
      await second.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
    ).toBe(true);

    const secondReload = second.waitForEvent("load");
    await second.getByRole("button", { name: "Reload now", exact: true }).click();
    await secondReload;
    await expect(draft).toHaveValue("");
    await expect(second.getByText("Update ready", { exact: true })).toBeHidden();
    expect(secondNavigations).toEqual({ requests: 1, loads: 1 });
  });
});

test("remembers a dismissed worker but offers a newer waiting worker", async ({ page }) => {
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

    await checkForUpdate(page);
    await expect(title).toBeHidden();
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
