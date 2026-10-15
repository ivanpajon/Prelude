import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

export async function waitForWorker(page: Page) {
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

export function trackDocumentNavigations(page: Page) {
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

/** Publishes changed worker scripts during `run`, then restores the built worker. */
export async function withWorkerRevisions(
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

/** Fetches each path in the page and reports its status and cache policy. */
export function fetchFromPage(page: Page, paths: string[]) {
  return page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (path) => {
          const response = await fetch(path);
          await response.text();
          return {
            path,
            status: response.status,
            cacheControl: response.headers.get("Cache-Control"),
          };
        }),
      ),
    paths,
  );
}

/** Lists every URL in Cache Storage. */
export function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => request.url);
  });
}

/** Reports whether each fetch fails, as it should for uncached API paths while offline. */
export function fetchFailures(page: Page, paths: string[]) {
  return page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (path) => {
          try {
            await fetch(path);
            return false;
          } catch {
            return true;
          }
        }),
      ),
    paths,
  );
}
