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

test("keeps the chosen color theme after a reload", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("frames the app page with a sidebar that collapses to icons", async ({ page }) => {
  // Narrower than 768px the sidebar is a sheet, which other viewports don't collapse.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/private");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  const sidebar = page.locator('[data-slot="sidebar"]');
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The page has no language selector for waitForHydration, and a click before hydration is
  // lost, so this clicks until the sidebar answers.
  await expect(async () => {
    if ((await sidebar.getAttribute("data-collapsible")) !== "icon") {
      await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
    }
    await expect(sidebar).toHaveAttribute("data-collapsible", "icon", { timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: /Ada Lovelace/ }).click();
  await expect(page.getByRole("menuitem", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Theme" })).toBeVisible();
});
