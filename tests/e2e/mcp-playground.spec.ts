import { expect, type Page, test } from "@playwright/test";

function playground(page: Page) {
  return page.getByRole("region", { name: "A little input. Real action.", exact: true });
}

async function discover(page: Page) {
  const widget = playground(page);
  await widget.getByRole("button", { name: "Discover tools", exact: true }).click();
  await expect(widget.getByRole("group", { name: "MCP tools" })).toBeVisible();
  await expect(widget.getByText("3 tools available.", { exact: false })).toBeVisible();
  return widget;
}

test("discovers real tools, exposes schemas, and handles arguments and tool errors with the keyboard", async ({
  page,
}) => {
  await page.goto("/playground");
  const widget = playground(page);
  const discoverButton = widget.getByRole("button", { name: "Discover tools", exact: true });
  await discoverButton.focus();
  await page.keyboard.press("Enter");
  const tools = widget.getByRole("group", { name: "MCP tools" });
  await expect(tools.getByRole("button")).toHaveCount(3);
  expect((await tools.getByRole("button").allTextContents()).sort()).toEqual([
    "createTask",
    "listTasks",
    "setTaskCompleted",
  ]);
  await expect(tools.getByRole("button", { name: "listTasks", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const argumentsInput = widget.getByRole("textbox", { name: "Arguments JSON" });
  expect(["all", "active", "completed"]).toContain(
    JSON.parse(await argumentsInput.inputValue()).status,
  );
  await argumentsInput.fill('{"status":"all"}');

  const schemas = widget.locator("details");
  await schemas.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(schemas.locator("pre")).toBeVisible();
  expect(JSON.parse(await schemas.locator("pre").innerText())).toMatchObject({
    input: {
      type: "object",
      required: ["status"],
      properties: { status: { enum: expect.arrayContaining(["all", "active", "completed"]) } },
    },
    output: { type: "array" },
  });

  const run = widget.getByRole("button", { name: "Run tool", exact: true });
  await run.focus();
  await page.keyboard.press("Enter");
  const result = widget.getByRole("region", { name: "Response", exact: true });
  await expect(result).toContainText("Explore the workspace");
  expect(JSON.parse(await result.innerText())).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: "Explore the workspace", completed: true }),
    ]),
  );

  await widget.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await expect(result).toContainText("Your tool’s response will appear here.");
  await expect(argumentsInput).toHaveValue('{"status":"all"}');

  for (const [value, message] of [
    ["{", "Enter valid JSON"],
    ["[]", "Arguments must be a JSON object"],
  ] as const) {
    await argumentsInput.fill(value);
    await run.click();
    await expect(widget.getByRole("alert")).toContainText(message);
    await expect(argumentsInput).toHaveAttribute("aria-invalid", "true");
    await expect(run).toBeEnabled();
  }

  await tools.getByRole("button", { name: "setTaskCompleted", exact: true }).click();
  await argumentsInput.fill(JSON.stringify({ id: crypto.randomUUID(), completed: true }));
  await run.click();
  await expect(
    widget.getByRole("status").filter({ hasText: "Tool returned an error" }),
  ).toBeVisible();
  await expect(result).toContainText("NOT_FOUND");
  await expect(run).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("creates and completes through MCP while refreshing the RPC workbench without reloading", async ({
  page,
}, testInfo) => {
  const title = `Playground ${testInfo.project.name} ${crypto.randomUUID()}`;
  await page.goto("/playground");
  const workbenchDraft = page.getByRole("textbox", { name: "New task", exact: true });
  await workbenchDraft.fill("Keep this unsaved draft");
  const widget = await discover(page);
  const tools = widget.getByRole("group", { name: "MCP tools" });
  const argumentsInput = widget.getByRole("textbox", { name: "Arguments JSON" });
  const run = widget.getByRole("button", { name: "Run tool", exact: true });
  const result = widget.getByRole("region", { name: "Response", exact: true });

  await tools.getByRole("button", { name: "createTask", exact: true }).click();
  await expect(
    widget.getByText("This tool changes the shared demo data.", { exact: true }),
  ).toBeVisible();
  const createDraft = JSON.stringify({ title: `  ${title}  ` });
  await argumentsInput.fill(createDraft);
  // Two events in the same turn must not enqueue duplicate mutations before React renders.
  await run.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(result).toContainText(title);
  const created = JSON.parse(await result.innerText()) as { id: string };
  expect(created).toMatchObject({ id: expect.any(String), title, completed: false });
  const tasks = page.getByRole("list", { name: "Tasks", exact: true });
  await expect(tasks.getByText(title, { exact: true })).toHaveCount(1);
  await expect(workbenchDraft).toHaveValue("Keep this unsaved draft");

  await tools.getByRole("button", { name: "setTaskCompleted", exact: true }).click();
  await argumentsInput.fill(JSON.stringify({ id: created.id, completed: true }));
  await run.click();
  await expect(result).toContainText('"completed": true');
  expect(JSON.parse(await result.innerText())).toMatchObject({
    id: created.id,
    title,
    completed: true,
  });
  await expect(
    tasks.getByRole("button", { name: `Mark ${title} as active`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(workbenchDraft).toHaveValue("Keep this unsaved draft");

  await tools.getByRole("button", { name: "createTask", exact: true }).click();
  await expect(argumentsInput).toHaveValue(createDraft);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("retries tool discovery after a network failure", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.getByRole("list", { name: "Tasks", exact: true })).toBeVisible();
  // Only interrupt the action transport; retries still reach the real MCP implementation.
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await route.abort("internetdisconnected");
    } else {
      await route.continue();
    }
  });
  const widget = playground(page);
  const button = widget.getByRole("button", { name: "Discover tools", exact: true });
  await button.click();
  await expect(widget.getByRole("alert")).toContainText("Use Discover tools to try again");
  await expect(button).toBeEnabled();
  await page.unroute("**/*");
  await discover(page);
  await expect(widget.getByRole("alert")).toHaveCount(0);
});
