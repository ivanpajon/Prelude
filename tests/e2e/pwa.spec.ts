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

test("shows an offline fallback without caching application data or RSC", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForWorker(page);
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
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("_rsc")).toBe(false);
  }
  await context.setOffline(true);
  await page.goto("/never-visited-offline-page");
  await expect(page.getByRole("heading", { name: "You’re offline." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "A small list. A working stack." })).toBeVisible();
});

test("waits for user consent before activating a real worker update", async ({ page }) => {
  test.setTimeout(45_000);
  const workerPath = fileURLToPath(new URL("../../apps/web/public/sw.js", import.meta.url));
  const original = await readFile(workerPath);
  await page.goto("/");
  await waitForWorker(page);
  try {
    await writeFile(
      workerPath,
      Buffer.concat([original, Buffer.from(`\n// update-test-${Date.now()}\n`)]),
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    const update = page.getByRole("button", { name: "Reload to update", exact: true });
    await expect(update).toBeVisible();
    expect(
      await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting)),
    ).toBe(true);
    const reload = page.waitForEvent("load");
    await update.click();
    await reload;
    await expect(
      page.getByRole("heading", { name: "A small list. A working stack." }),
    ).toBeVisible();
    await expect(update).toBeHidden();
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
    ).toBe(true);
  } finally {
    await writeFile(workerPath, original);
  }
});
