import type { Client } from "@modelcontextprotocol/client";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const resourceUri = "ui://prelude/tasks.html";

export async function expectTaskAppResource(client: Client) {
  const { tools } = await client.listTools();
  expect(tools.find((tool) => tool.name === "listTasks")?._meta).toMatchObject({
    ui: { resourceUri },
  });
  const { resources } = await client.listResources();
  expect(resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ uri: resourceUri, mimeType: "text/html;profile=mcp-app" }),
    ]),
  );
  const { contents } = await client.readResource({ uri: resourceUri });
  expect(contents).toHaveLength(1);
  const resource = contents[0];
  expect(resource).toMatchObject({
    uri: resourceUri,
    mimeType: "text/html;profile=mcp-app",
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } },
  });
  if (!resource || !("text" in resource)) throw new Error("Expected self-contained MCP App HTML");
  expect(resource.text).toContain("Your tasks, right here.");
  expect(resource.text).toContain("prelude-mcp-app-config");
  expect(resource.text).not.toContain("<!--PRELUDE_MCP_APP_CONFIG-->");
  expect(resource.text).not.toMatch(/<script\b[^>]*\bsrc\s*=/i);
  expect(resource.text).not.toMatch(/<link\b[^>]*\brel=["']stylesheet/i);
  expect(resource.text).toContain("connect-src 'none'");
  expect(resource.text).toContain("font-src 'none'");
  const config = resource.text.match(
    /<script type="application\/json" id="prelude-mcp-app-config">([^<]+)<\/script>/,
  );
  expect(JSON.parse(config?.[1] ?? "null")).toEqual({
    tools: {
      listTasks: "listTasks",
      createTask: "createTask",
      deleteTask: "deleteTask",
      setTaskCompleted: "setTaskCompleted",
      updateTaskTitle: "updateTaskTitle",
    },
  });
}

/** Exercise the shipped Inspector and real postMessage bridge; no transport or UI mocks. */
export async function exerciseTaskApp({
  page,
  request,
  inspectorOrigin,
  sandboxOrigin,
}: {
  page: Page;
  request: APIRequestContext;
  inspectorOrigin: string;
  sandboxOrigin: string;
}) {
  page.setDefaultTimeout(15_000);
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    const sizes: unknown[] = [];
    Object.defineProperty(window, "preludeObservedAppCalls", { value: calls });
    Object.defineProperty(window, "preludeObservedAppSizes", { value: sizes });
    window.addEventListener("message", (event) => {
      if (event.data?.method === "tools/call") {
        calls.push({ name: event.data.params.name, arguments: event.data.params.arguments });
      }
      if (event.data?.method === "ui/notifications/size-changed") sizes.push(event.data.params);
    });
  });
  const widgetRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.frame().url() === "about:srcdoc") widgetRequests.push(outgoing.url());
  });
  await page.goto("/api/mcp/inspector");
  const wrapper = page.locator('iframe[title="Prelude MCP Inspector"]');
  await expect(wrapper).toHaveAttribute("src", `${inspectorOrigin}/`);
  const inspector = wrapper.contentFrame();
  const connection = inspector.getByRole("switch", { name: /Connect or disconnect/ });
  await connection.press("Space");
  await expect(connection).toBeChecked();
  await inspector.getByText("Apps", { exact: true }).click();
  await inspector.getByRole("button", { name: /^List tasks/ }).click();
  const app = inspector.getByTestId("apps-form");
  const status = app.getByRole("textbox", { name: /^status/ });
  await status.press("ControlOrMeta+A");
  await status.pressSequentially('"all"');
  await app.getByTestId("open-app").click();
  await expect(app).toHaveAttribute("data-app-status", "ready");
  const sandboxFrame = app.locator("iframe");
  await expect(sandboxFrame).toHaveAttribute(
    "src",
    new RegExp(`^${sandboxOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
  );
  const embeddedFrame = sandboxFrame.contentFrame().locator("iframe");
  await expect(embeddedFrame).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  const widget = embeddedFrame.contentFrame();
  const tasks = widget.getByRole("list", { name: "Tasks", exact: true });
  await expect(tasks.getByText("Explore the workspace", { exact: true })).toBeVisible();
  await expect(tasks).toHaveAttribute("aria-busy", "false");
  await expect(widget.getByRole("heading", { name: "Your tasks, right here." })).toBeVisible();
  await expect(widget.locator("script[src], link[rel=stylesheet]")).toHaveCount(0);
  const policies = await widget
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("content")));
  expect(policies.join(";")).toContain("connect-src 'none'");
  const ownPolicy = policies.find((policy) => policy?.includes("font-src 'none'"));
  expect(ownPolicy).toBeDefined();
  expect(ownPolicy).not.toContain("'unsafe-eval'");
  await widget
    .locator("body")
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  const observedCalls = () =>
    inspector
      .locator("body")
      .evaluate(
        () =>
          Reflect.get(window, "preludeObservedAppCalls") as { name: string; arguments: unknown }[],
      );
  expect(await observedCalls()).toEqual([]);

  const originalTitle = `MCP App ${crypto.randomUUID()}`;
  let title = originalTitle;
  const input = widget.getByRole("textbox", { name: "New task", exact: true });
  await input.fill(`  ${title}  `);
  await input.press("Enter");
  await expect(tasks.getByText(title, { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  const created = (await (await request.get("/api/v1/tasks?status=all")).json()).find(
    (item: { title: string }) => item.title === title,
  );
  expect(created).toMatchObject({ id: expect.any(String), title, completed: false });
  await widget.getByRole("button", { name: `Mark ${title} as completed`, exact: true }).click();
  await expect(
    widget.getByRole("button", { name: `Mark ${title} as active`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await input.fill("Keep this widget draft");
  const edit = widget.getByRole("button", { name: `Edit ${title}`, exact: true });
  await edit.press("Enter");
  const titleInput = widget.getByRole("textbox", { name: "Task title", exact: true });
  await expect(titleInput).toBeFocused();
  await titleInput.fill("A cancelled edit");
  await titleInput.press("Escape");
  await expect(titleInput).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.press("Enter");
  await titleInput.fill("   ");
  await titleInput.press("Enter");
  await expect(
    widget.getByText("Enter a task between 1 and 120 characters.", { exact: true }),
  ).toBeVisible();
  title = `Edited ${title}`;
  await titleInput.fill(`  ${title}  `);
  await widget
    .getByRole("button", { name: "Save", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(titleInput).toHaveCount(0);
  await expect(widget.getByRole("button", { name: `Edit ${title}`, exact: true })).toBeFocused();
  await expect(input).toHaveValue("Keep this widget draft");
  expect(await (await request.get("/api/v1/tasks?status=completed")).json()).toEqual(
    expect.arrayContaining([{ ...created, title, completed: true }]),
  );
  await widget.getByRole("button", { name: "Active", exact: true }).click();
  await expect(tasks).toHaveAttribute("aria-busy", "false");
  await expect(tasks.getByText(title, { exact: true })).toHaveCount(0);
  await widget.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(tasks.getByText(title, { exact: true })).toBeVisible();

  const outsideTitle = `Outside ${crypto.randomUUID()}`;
  const outside = await request.post("/api/v1/tasks", { data: { title: outsideTitle } });
  expect(outside.status()).toBe(201);
  const outsideTask = await outside.json();
  expect(
    (
      await request.patch(`/api/v1/tasks/${outsideTask.id}`, { data: { completed: true } })
    ).status(),
  ).toBe(200);
  await expect(tasks.getByText(outsideTitle, { exact: true })).toHaveCount(0);
  await widget.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(tasks.getByText(outsideTitle, { exact: true })).toBeVisible();
  await input.fill("Keep this widget draft");
  const remove = widget.getByRole("button", { name: `Delete ${title}`, exact: true });
  await remove.focus();
  await remove.press("Enter");
  await expect(tasks.getByText(title, { exact: true })).toHaveCount(0);
  await expect(tasks).toHaveAttribute("aria-busy", "false");
  await expect(input).toHaveValue("Keep this widget draft");
  expect(await (await request.get("/api/v1/tasks?status=all")).json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created.id })]),
  );

  const externalDelete = await request.delete(`/api/v1/tasks/${outsideTask.id}`);
  expect(externalDelete.status()).toBe(200);
  expect(await externalDelete.json()).toEqual({ ...outsideTask, completed: true });
  // Another client changed the shared demo. A stale row remains until a refetch.
  await expect(tasks.getByText(outsideTitle, { exact: true })).toBeVisible();
  await widget.getByRole("button", { name: `Edit ${outsideTitle}`, exact: true }).click();
  const failedTitle = `Edited ${outsideTitle}`;
  await titleInput.fill(failedTitle);
  await titleInput.press("Enter");
  await expect(widget.getByRole("alert")).toContainText("The tool could not complete the request.");
  await expect(titleInput).toHaveValue(failedTitle);
  await expect(input).toHaveValue("Keep this widget draft");
  await widget.getByRole("button", { name: "Cancel", exact: true }).click();
  await widget.getByRole("button", { name: `Delete ${outsideTitle}`, exact: true }).click();
  await expect(widget.getByRole("alert")).toContainText("The tool could not complete the request.");
  await expect(input).toHaveValue("Keep this widget draft");
  await widget.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(tasks.getByText(outsideTitle, { exact: true })).toHaveCount(0);
  await expect(tasks).toHaveAttribute("aria-busy", "false");
  await expect(input).toHaveValue("Keep this widget draft");
  expect(await observedCalls()).toEqual([
    { name: "createTask", arguments: { title: originalTitle } },
    { name: "listTasks", arguments: { status: "all" } },
    { name: "setTaskCompleted", arguments: { id: created.id, completed: true } },
    { name: "listTasks", arguments: { status: "all" } },
    { name: "updateTaskTitle", arguments: { id: created.id, title } },
    { name: "listTasks", arguments: { status: "all" } },
    { name: "listTasks", arguments: { status: "active" } },
    { name: "listTasks", arguments: { status: "completed" } },
    { name: "listTasks", arguments: { status: "completed" } },
    { name: "deleteTask", arguments: { id: created.id } },
    { name: "listTasks", arguments: { status: "completed" } },
    { name: "updateTaskTitle", arguments: { id: outsideTask.id, title: failedTitle } },
    { name: "deleteTask", arguments: { id: outsideTask.id } },
    { name: "listTasks", arguments: { status: "completed" } },
  ]);
  expect(widgetRequests).toEqual([]);
  expect(
    await widget.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  const observedSizes = () =>
    inspector
      .locator("body")
      .evaluate(
        () => Reflect.get(window, "preludeObservedAppSizes") as { width: number; height: number }[],
      );
  await expect.poll(async () => (await observedSizes()).length).toBeGreaterThan(0);
  const beforeResize = (await observedSizes()).length;
  await sandboxFrame.evaluate((element) => {
    element.style.width = "360px";
    element.style.maxWidth = "360px";
  });
  await expect.poll(async () => (await observedSizes()).length).toBeGreaterThan(beforeResize);
  await expect.poll(() => widget.locator("body").evaluate(() => innerWidth)).toBe(360);
  expect(
    await widget.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  expect((await observedSizes()).at(-1)?.height).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("mcp-app-inspector.png") });

  await page.goto("/playground?status=completed");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(outsideTitle, { exact: true }),
  ).toHaveCount(0);
}
