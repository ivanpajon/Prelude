import { expect, test } from "@playwright/test";

test("development rendering and reloads have no framework errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByText("Tile at the end.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save idea", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Compact view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Compact view", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Open Next.js Dev Tools", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open issues overlay", exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
