import { expect, test } from "@playwright/test";
import { waitForHydration } from "../hydration";
import { homeLinkName } from "../page-state";

test.describe("server rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("renders the home page without browser JavaScript", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, includeHidden: true })).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: homeLinkName.en, exact: true, includeHidden: true }),
    ).toHaveAttribute("href", "/en");
  });
});

test("returns home from a missing page and supports browser history on narrow screens", async ({
  page,
}) => {
  await page.goto("/missing-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A fresh direction.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("main").getByRole("link").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  const home = page.getByRole("link", { name: homeLinkName.en, exact: true });
  await expect(home).toHaveAttribute("href", "/en");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  const homeHeading = (await heading.textContent()) ?? "";
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/en/missing-page");
  await expect(heading).toHaveText("A fresh direction.");
  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await home.click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await expect(heading).toHaveText(homeHeading);
});

test("hydrates the homepage without hydration errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|server rendered|didn't match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });

  await page.goto("/");
  await waitForHydration(page);
  // Let the interactive render and its effects paint before checking errors.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("sends security headers and runs pages within their Content Security Policy", async ({
  page,
  request,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });

  const home = await page.goto("/");
  const headers = home?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers).not.toHaveProperty("x-powered-by");
  // Hydration needs the page scripts, so it shows they run under the policy.
  await waitForHydration(page);

  // API routes keep the shared headers but set their own policies (the API reference uses a CDN).
  for (const path of ["/api/health", "/api/openapi.json"]) {
    const api = (await request.get(path)).headers();
    expect(api["x-content-type-options"]).toBe("nosniff");
    expect(api).not.toHaveProperty("content-security-policy");
    expect(api).not.toHaveProperty("x-powered-by");
  }
  expect(violations).toEqual([]);
});
