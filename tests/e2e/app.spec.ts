import { expect, test } from "@playwright/test";

const listRpc = /\/api\/rpc\/tasks\/list(?:\?|$)/;
const createRpc = /\/api\/rpc\/tasks\/create(?:\?|$)/;

test.describe("server rendering", () => {
  test.use({ javaScriptEnabled: false });

  test("includes the task list in server-rendered HTML without browser JavaScript", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    // A streamed Suspense segment may be hidden until React's reveal script runs.
    // Assert its real HTML list exists, rather than relying on that script.
    const tasks = page.getByRole("list", { name: "Tasks", includeHidden: true });
    await expect(tasks.getByText("Explore the workspace", { exact: true })).toHaveCount(1);
    await expect(tasks.getByText("Make this template yours", { exact: true })).toHaveCount(1);
    const icon = page
      .getByRole("button", { name: "Compact view", exact: true, includeHidden: true })
      .locator("svg");
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    await expect(icon.locator("path").first()).toHaveAttribute("d", /\S/);
    await expect(
      page.getByRole("button", { name: "Start", exact: true, includeHidden: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Save idea", exact: true, includeHidden: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

test("hydrates without an immediate duplicate RPC or hydration errors", async ({ page }) => {
  const listRequests: string[] = [];
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  page.on("request", (request) => {
    if (listRpc.test(request.url())) listRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|server rendered|didn't match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  const compact = page.getByRole("button", { name: "Compact view", exact: true });
  await expect(compact).toHaveAttribute("aria-pressed", "false");
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  // Let the interactive render and its effects paint before checking requests.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  expect(listRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`animation previews respond to keyboard with motion preference ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    const preview = page.getByRole("region", { name: "Small details. More life." });
    const start = preview.getByRole("button", { name: "Start", exact: true });
    const end = preview.getByRole("button", { name: "End", exact: true });
    const save = preview.getByRole("button", { name: "Save idea", exact: true });
    const tile = preview.locator("[aria-hidden='true'] > div");
    const bookmark = preview.locator("svg").last();
    await expect(start).toHaveAttribute("aria-pressed", "true");
    const initialX = await tile.evaluate((element) => element.getBoundingClientRect().x);
    const initialPaths = await bookmark
      .locator("path")
      .evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));

    await start.focus();
    await page.keyboard.press("Tab");
    await expect(end).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(end).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => tile.evaluate((element) => element.getBoundingClientRect().x))
      .toBeGreaterThan(initialX + 50);
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Space");
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        bookmark
          .locator("path")
          .evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
      )
      .not.toEqual(initialPaths);
    await expect(end).toHaveAttribute("aria-pressed", "true");

    await start.click();
    await expect
      .poll(() => tile.evaluate((element) => element.getBoundingClientRect().x))
      .toBeCloseTo(initialX, 0);
    await save.click();
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

test("prevents duplicate creation when a form submits twice before rendering", async ({ page }) => {
  const title = `Single submission ${crypto.randomUUID()}`;
  const requests: string[] = [];
  page.on("request", (request) => {
    if (createRpc.test(request.url())) requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await page.getByRole("textbox", { name: "New task" }).fill(title);
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  expect(requests).toHaveLength(1);
});

test("creates and completes a task that survives a hard reload", async ({ page }, testInfo) => {
  const title = `Build ${testInfo.project.name} ${crypto.randomUUID()}`;
  await page.goto("/");
  await page.getByRole("textbox", { name: "New task", exact: true }).fill(title);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New task", exact: true })).toHaveValue("");

  await page.getByRole("button", { name: `Mark ${title} as completed`, exact: true }).click();
  const completed = page.getByRole("button", { name: `Mark ${title} as active`, exact: true });
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();
});

test("keeps URL filters consistent through history, reloads, and invalid values", async ({
  page,
}) => {
  await page.goto("/");
  const active = page.getByRole("button", { name: "Active", exact: true });
  const completed = page.getByRole("button", { name: "Completed", exact: true });
  const all = page.getByRole("button", { name: "All tasks", exact: true });
  const tasks = page.getByRole("list", { name: "Tasks" });

  await active.click();
  await expect(page).toHaveURL(/\?status=active$/);
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByText("Create your first feature", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Explore the workspace", { exact: true })).toHaveCount(0);

  await completed.click();
  await expect(page).toHaveURL(/\?status=completed$/);
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByText("Explore the workspace", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Create your first feature", { exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\?status=active$/);
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByText("Create your first feature", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\?status=completed$/);
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(completed).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByText("Explore the workspace", { exact: true })).toBeVisible();

  await page.goto("/?status=invalid");
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByText("Explore the workspace", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Create your first feature", { exact: true })).toBeVisible();
});

test("keeps compact view local while filters change", async ({ page, browser }) => {
  await page.goto("/");
  const compact = page.getByRole("button", { name: "Compact view", exact: true });
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page).toHaveURL(/\?status=active$/);
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();

  const isolated = await browser.newContext({ serviceWorkers: "block" });
  try {
    const freshPage = await isolated.newPage();
    await freshPage.goto(new URL("/", page.url()).href);
    await expect(
      freshPage.getByRole("button", { name: "Compact view", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(compact).toHaveAttribute("aria-pressed", "true");
  } finally {
    await isolated.close();
  }
});

test("supports keyboard density changes with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const tasks = page.getByRole("list", { name: "Tasks" });
  const compact = page.getByRole("button", { name: "Compact view", exact: true });
  const icon = compact.locator("svg");
  const path = icon.locator("path").first();
  await expect(tasks).toBeVisible();
  const originalText = await tasks.innerText();
  const originalHeight = await tasks.evaluate((element) => element.getBoundingClientRect().height);
  const originalPath = await path.getAttribute("d");
  expect(originalPath).toBeTruthy();

  await page.getByRole("button", { name: "Completed", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(compact).toBeFocused();
  await page.keyboard.press("Space");
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await expect(compact).toBeFocused();
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => path.getAttribute("d")).not.toBe(originalPath);
  await expect
    .poll(() => tasks.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(originalHeight);
  expect(await tasks.innerText()).toBe(originalText);

  await page.keyboard.press("Enter");
  await expect(compact).toHaveAttribute("aria-pressed", "false");
  await expect(compact).toBeFocused();
  await expect.poll(() => path.getAttribute("d")).toBe(originalPath);
  await expect
    .poll(() => tasks.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(originalHeight);
});

test("recovers a failed query when the connection returns", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await page.route(listRpc, (route) => route.abort("internetdisconnected"));

  // Only the all-tasks query was hydrated; active must go through the network.
  await page.getByRole("button", { name: "Active", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "Could not load tasks" });
  await expect(error).toBeVisible({ timeout: 10_000 });
  await page.unroute(listRpc);
  await error.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(
    page
      .getByRole("list", { name: "Tasks" })
      .getByText("Create your first feature", { exact: true }),
  ).toBeVisible();
});

test("retains a failed mutation's draft and supports retry", async ({ page }, testInfo) => {
  const title = `Retry ${testInfo.project.name} ${crypto.randomUUID()}`;
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "New task", exact: true });
  const add = page.getByRole("button", { name: "Add task", exact: true });
  const feedback = page.locator("#task-feedback");
  await page.route(createRpc, (route) => route.abort("internetdisconnected"));
  await input.fill(title);
  await add.click();

  await expect(feedback).toContainText(/\S/);
  await expect(input).toHaveValue(title);
  await expect(add).toBeEnabled();
  await page.unroute(createRpc);
  await add.click();
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(feedback).toBeEmpty();
});
