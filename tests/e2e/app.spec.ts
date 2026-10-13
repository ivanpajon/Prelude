import { expect, test } from "@playwright/test";

test.describe("server rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("renders the homepage and animation previews without browser JavaScript", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, includeHidden: true })).toHaveText(
      /Less setup\.\s*More building\./,
    );
    await expect(
      page.getByRole("link", { name: "Prelude home", exact: true, includeHidden: true }),
    ).toHaveAttribute("href", "/en");
    await expect(
      page.getByRole("button", { name: "Move to end", exact: true, includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Save idea", exact: true, includeHidden: true }),
    ).toHaveAttribute("aria-pressed", "false");
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
  const home = page.getByRole("link", { name: "Prelude home", exact: true });
  await expect(home).toHaveAttribute("href", "/en");
  await expect(page.getByRole("region", { name: "Small details. More life." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/en/missing-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A fresh direction.");
  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await home.click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Less setup\.\s*More building\./,
  );
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
  const save = page.getByRole("button", { name: "Save idea", exact: true });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(page.getByRole("button", { name: "Idea saved", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  await page.getByRole("button", { name: "Move to end", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move to start", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Idea saved", exact: true })).toBeVisible();

  // API routes keep the shared headers but set their own policies (the API reference uses a CDN).
  for (const path of ["/api/health", "/api/openapi.json"]) {
    const api = (await request.get(path)).headers();
    expect(api["x-content-type-options"]).toBe("nosniff");
    expect(api).not.toHaveProperty("content-security-policy");
    expect(api).not.toHaveProperty("x-powered-by");
  }
  expect(violations).toEqual([]);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`animation previews respond to keyboard with motion preference ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    const preview = page.getByRole("region", { name: "Small details. More life." });
    const moveToEnd = preview.getByRole("button", { name: "Move to end", exact: true });
    const moveToStart = preview.getByRole("button", { name: "Move to start", exact: true });
    const save = preview.getByRole("button", { name: "Save idea", exact: true });
    const saved = preview.getByRole("button", { name: "Idea saved", exact: true });
    const tile = preview.locator("[aria-hidden='true'] > div");
    const bookmark = preview.locator("svg").last();
    await expect(moveToEnd).toBeVisible();
    const initialX = await tile.evaluate((element) => element.getBoundingClientRect().x);
    const initialPaths = await bookmark
      .locator("path")
      .evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));

    await moveToEnd.focus();
    await page.keyboard.press("Enter");
    await expect(moveToStart).toBeFocused();
    await expect
      .poll(() => tile.evaluate((element) => element.getBoundingClientRect().x))
      .toBeGreaterThan(initialX + 50);
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Space");
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        bookmark
          .locator("path")
          .evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
      )
      .not.toEqual(initialPaths);
    await expect(moveToStart).toBeVisible();

    await moveToStart.click();
    await expect(moveToEnd).toBeVisible();
    await expect
      .poll(() => tile.evaluate((element) => element.getBoundingClientRect().x))
      .toBeCloseTo(initialX, 0);
    await saved.click();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() =>
        bookmark
          .locator("path")
          .evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
      )
      .toEqual(initialPaths);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
