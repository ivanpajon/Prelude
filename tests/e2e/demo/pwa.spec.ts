import { expect, test } from "@playwright/test";
import {
  cachedUrls,
  fetchFailures,
  fetchFromPage,
  trackDocumentNavigations,
  waitForWorker,
  withWorkerRevisions,
} from "../pwa-helpers";

test("shows an offline fallback without caching the playground or task data", async ({
  page,
  context,
}) => {
  await page.goto("/playground");
  await waitForWorker(page);
  // Navigate once under worker control so document caching would show up in Cache Storage.
  await page.reload();
  const apiPaths = ["/api/docs", "/api/openapi.json", "/api/v1/tasks?status=all", "/api/mcp"];
  expect(await fetchFromPage(page, apiPaths)).toEqual(
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
  const cached = await cachedUrls(page);
  expect(cached.some((value) => new URL(value).pathname === "/offline")).toBe(true);
  for (const value of cached) {
    const url = new URL(value);
    expect(url.pathname).not.toBe("/playground");
    expect(url.pathname).not.toMatch(/^\/(en|es)(?:\/|$)/);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("_rsc")).toBe(false);
  }
  await context.setOffline(true);
  expect(await fetchFailures(page, apiPaths)).toEqual(apiPaths.map(() => true));
  await page.goto("/playground?status=completed");
  await expect(page.getByRole("heading", { name: "You’re offline." })).toBeVisible();
  await context.setOffline(false);
  // Try again reloads the address that failed, including its filter.
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("keeps another tab's task draft until that tab approves its own reload", async ({
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
