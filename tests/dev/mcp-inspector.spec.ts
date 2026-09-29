import { expect, test } from "@playwright/test";

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
  await expect(page).toHaveTitle("Prelude MCP Inspector");
  const iframe = page.locator('iframe[title="Prelude MCP Inspector"]');
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
  await inspector.getByText("Tools", { exact: true }).click();
  const tools = inspector.getByTestId("tools-screen");
  await expect(tools).toHaveAttribute("data-tool-count", "4");
  for (const name of ["listTasks", "createTask", "setTaskCompleted", "deleteTask"]) {
    await expect(tools.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  }

  const title = `Inspector ${crypto.randomUUID()}`;
  await tools.getByRole("button", { name: /createTask/ }).click();
  await tools.getByRole("textbox", { name: /^title/ }).fill(`  ${title}  `);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  const listed = await request.get("/api/v1/tasks?status=all");
  expect(listed.ok()).toBe(true);
  const created = (await listed.json()).find((task: { title: string }) => task.title === title);
  expect(created).toMatchObject({ id: expect.any(String), title, completed: false });

  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await tools.getByRole("button", { name: /setTaskCompleted/ }).click();
  await tools.getByRole("textbox", { name: /^id/ }).fill(created.id);
  await tools.getByRole("checkbox", { name: /^completed/ }).check();
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);

  await tools.getByRole("button", { name: "Close results", exact: true }).click();
  await tools.getByRole("button", { name: /listTasks/ }).click();
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
  await tools.getByRole("button", { name: /deleteTask/ }).click();
  await tools.getByRole("textbox", { name: /^id/ }).fill(created.id);
  await tools.getByRole("button", { name: "Execute Tool", exact: true }).click();
  await expect(tools).toHaveAttribute("data-call-status", "ok");
  await expect(tools).toContainText(title);
  expect(await (await request.get("/api/v1/tasks?status=all")).json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created.id })]),
  );
  await page.goto("/playground");
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
