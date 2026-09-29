import { expect, test } from "@playwright/test";
import { exerciseTaskApp } from "../mcp-apps";

test("opens the official Inspector from the playground and runs the real sandboxed Task App", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.goto("/playground");
  const section = page.getByRole("region", {
    name: "The same tasks. A new place to work.",
    exact: true,
  });
  const link = section.getByRole("link", {
    name: "Open Inspector (opens in a new tab)",
    exact: true,
  });
  await expect(link).toHaveAttribute("target", "_blank");
  const popup = page.waitForEvent("popup");
  await link.focus();
  await link.press("Enter");
  const preview = await popup;
  try {
    await expect(preview).toHaveURL(/\/api\/mcp\/inspector$/);
    await exerciseTaskApp({
      page: preview,
      request,
      inspectorOrigin: "http://127.0.0.1:6284",
      sandboxOrigin: "http://127.0.0.1:6286",
    });
  } finally {
    await preview.close();
  }
});
