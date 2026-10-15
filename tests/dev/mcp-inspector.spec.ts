import { expect, test } from "@playwright/test";
import { site } from "../../apps/web/src/site";
import { expectedToolNames } from "../../apps/web/src/testing/mcp-tool-names";

test("embedded Inspector stays authenticated and discovers every generated tool", async ({
  baseURL,
  page,
  request,
}) => {
  page.setDefaultTimeout(10_000);
  const unauthenticated = await request.get("http://127.0.0.1:6284/api/servers");
  expect(unauthenticated.status()).toBe(401);
  const crossOrigin = await request.get("http://127.0.0.1:6284/api/servers", {
    headers: { Origin: "https://unexpected.example" },
  });
  expect(crossOrigin.status()).toBe(403);
  for (const nestedPath of ["api/servers", "assets/index.js"]) {
    const response = await request.get(`/api/mcp/inspector/${nestedPath}`);
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const response = await page.goto("/api/mcp/inspector");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page).toHaveTitle(`${site.name} MCP Inspector`);
  const iframe = page.locator(`iframe[title="${site.name} MCP Inspector"]`);
  await expect(iframe).toHaveAttribute("src", "http://127.0.0.1:6284/");
  expect(await iframe.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize() });

  const inspector = iframe.contentFrame();
  const connection = inspector.getByRole("switch", { name: /Connect or disconnect/ });
  await expect(connection).not.toBeChecked();
  await expect(
    inspector.getByText(new URL("/api/mcp", baseURL).href, { exact: true }),
  ).toBeVisible();
  // Mantine's decorative switch track overlays its input; use the native keyboard action.
  await connection.press("Space");
  await expect(connection).toBeChecked();

  const names = await expectedToolNames(await (await request.get("/api/openapi.json")).json());
  // The Tools screen also opens for an API without operations; it then lists none.
  await inspector.getByText("Tools", { exact: true }).click();
  const tools = inspector.getByTestId("tools-screen");
  await expect(tools).toHaveAttribute("data-tool-count", String(names.length));
  for (const name of names) {
    // Match the exact name, so `listNotes` does not also match `listNotesByTag`.
    const tool = tools
      .getByRole("button")
      .filter({ has: inspector.getByText(name, { exact: true }) });
    await expect(tool).toHaveCount(1);
    await expect(tool).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath("mcp-inspector.png") });
});
