import { expect, test } from "@playwright/test";
import { site } from "../../../apps/web/src/site";
import { expectedToolNames } from "../../../apps/web/src/testing/mcp-tool-names";
import { waitForHydration } from "../../hydration";

test("embedded Inspector discovers generated tools and performs real CRUD against the shared API", async ({
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
  // Count every tool the server lists, so features added next to the demo still pass.
  const names = await expectedToolNames(await (await request.get("/api/openapi.json")).json());
  await inspector.getByText("Tools", { exact: true }).click();
  const tools = inspector.getByTestId("tools-screen");
  await expect(tools).toHaveAttribute("data-tool-count", String(names.length));
  // Match the exact name, so a user tool such as `listTasksByOwner` does not also match.
  const toolButton = (name: string) =>
    tools.getByRole("button").filter({ has: inspector.getByText(name, { exact: true }) });
  for (const name of [
    "listTasks",
    "createTask",
    "setTaskCompleted",
    "deleteTask",
    "updateTaskTitle",
  ]) {
    await expect(toolButton(name)).toBeVisible();
  }

  let title = `Inspector ${crypto.randomUUID()}`;
  await toolButton("createTask").click();
  await tools.getByRole("textbox", { name: /^title/ }).fill(`  ${title}  `);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  const listed = await request.get("/api/v1/tasks?status=all");
  expect(listed.ok()).toBe(true);
  const created = (await listed.json()).find((task: { title: string }) => task.title === title);
  expect(created).toMatchObject({ id: expect.any(String), title, completed: false });

  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await toolButton("updateTaskTitle").click();
  await tools.getByRole("textbox", { name: /^id/ }).fill(created.id);
  title = `Edited ${title}`;
  await tools.getByRole("textbox", { name: /^title/ }).fill(`  ${title}  `);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  created.title = title;

  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await toolButton("setTaskCompleted").click();
  await tools.getByRole("textbox", { name: /^id/ }).fill(created.id);
  await tools.getByRole("checkbox", { name: /^completed/ }).check();
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);

  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await toolButton("listTasks").click();
  // The generated enum has no redundant type keyword, so Inspector uses its JSON editor.
  const status = tools.getByRole("textbox", { name: /^status/ });
  await status.press("ControlOrMeta+A");
  await status.pressSequentially('"completed"');
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  await page.screenshot({ path: test.info().outputPath("mcp-inspector.png") });

  const completed = await request.get("/api/v1/tasks?status=completed");
  expect(await completed.json()).toEqual(expect.arrayContaining([{ ...created, completed: true }]));
  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await toolButton("deleteTask").click();
  await tools.getByRole("textbox", { name: /^id/ }).fill(created.id);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  expect(await (await request.get("/api/v1/tasks?status=all")).json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created.id })]),
  );
  await page.goto("/playground");
  await waitForHydration(page);
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toHaveCount(0);
  const rpc = page.waitForResponse((result) =>
    new URL(result.url()).pathname.startsWith("/api/rpc/"),
  );
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  expect((await rpc).ok()).toBe(true);
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toHaveCount(0);
});
