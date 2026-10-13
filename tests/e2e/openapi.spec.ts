import { expect, test } from "@playwright/test";

const scalarScript =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js";

test("opens the pinned Scalar reference from a narrow homepage", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  const unexpectedExternalRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  // The renderer is the only external resource needed; API calls must remain same-origin.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin || url === scalarScript) return route.continue();
    unexpectedExternalRequests.push(url);
    return route.abort();
  });

  await page.setViewportSize({ width: 320, height: 800 });
  const docs = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
    name: "API docs",
    exact: true,
  });
  await expect(docs).toBeVisible();
  await expect(docs).toHaveAttribute("href", "/api/docs");
  expect(await docs.getAttribute("target")).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const renderer = page.waitForResponse(scalarScript);
  await docs.click();
  expect((await renderer).ok()).toBe(true);
  await expect(page).toHaveURL((url) => url.origin === origin && url.pathname === "/api/docs");
  await expect(page).toHaveTitle("Prelude API Reference");
  await expect(page.getByRole("heading", { name: "Prelude API", exact: true })).toBeVisible();
  await expect(page.locator(`script[src="${scalarScript}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(unexpectedExternalRequests).toEqual([]);
});

test("serves the generated OpenAPI document without caching", async ({ request }) => {
  const response = await request.get("/api/openapi.json", {
    headers: { "Accept-Language": "es" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toMatchObject({
    openapi: expect.stringMatching(/^3\./),
    info: { title: "Prelude API", version: "1.0.0" },
    servers: [{ url: "/api" }],
  });
});

test("serves an uncached health check outside the API contract and localization", async ({
  request,
}) => {
  const response = await request.get("/api/health", {
    headers: { "Accept-Language": "es" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });

  const head = await request.head("/api/health");
  expect(head.status()).toBe(200);
  expect(await head.text()).toBe("");

  const spec = await (await request.get("/api/openapi.json")).json();
  expect(Object.keys(spec.paths ?? {}).some((path) => path.includes("health"))).toBe(false);
});
