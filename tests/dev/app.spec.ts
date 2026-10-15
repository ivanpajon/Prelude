import { expect, test } from "@playwright/test";
import { waitForHydration } from "../hydration";
import { documentMark, markDocument } from "../page-state";

test("development rendering and reloads have no framework errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await waitForHydration(page);
  const mark = await markDocument(page);
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveURL((url) => url.pathname === "/es");
  expect(await documentMark(page)).toBe(mark);

  await page.reload();
  await waitForHydration(page);
  expect(await documentMark(page)).toBeUndefined();
  await expect(page.getByRole("combobox", { name: "Idioma", exact: true })).toHaveValue("es");
  await expect(
    page.getByRole("button", { name: "Open Next.js Dev Tools", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open issues overlay", exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
