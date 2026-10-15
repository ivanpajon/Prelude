import { expect, test } from "@playwright/test";

// The home page animation previews. docs/motion.md explains how to remove them.

test.describe("server rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("renders the animation previews without browser JavaScript", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole("button", { name: "Move to end", exact: true, includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Save idea", exact: true, includeHidden: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });
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
