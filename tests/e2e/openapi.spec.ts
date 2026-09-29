import { expect, test } from "@playwright/test";

const scalarScript =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js";

test("opens the pinned Scalar reference from a narrow homepage and searches operations", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  const unexpectedExternalRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  // The renderer is the only external resource needed; API calls must remain same-origin.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin || url === scalarScript) return route.continue();
    unexpectedExternalRequests.push(url);
    return route.abort();
  });

  await page.setViewportSize({ width: 320, height: 800 });
  const docs = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
    name: "API docs",
    exact: true,
  });
  await expect(docs).toBeVisible();
  await expect(docs).toHaveAttribute("href", "/api/docs");
  expect(await docs.getAttribute("target")).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const renderer = page.waitForResponse(scalarScript);
  await docs.click();
  expect((await renderer).ok()).toBe(true);
  await expect(page).toHaveURL((url) => url.origin === origin && url.pathname === "/api/docs");
  await expect(page).toHaveTitle("Prelude API Reference");
  await expect(page.getByRole("heading", { name: "Prelude API", exact: true })).toBeVisible();
  await expect(page.locator(`script[src="${scalarScript}"]`)).toHaveCount(1);

  await page.getByRole("button", { name: "Open Menu", exact: true }).click();
  await page.getByRole("button", { name: /Open Search/ }).click();
  const search = page.getByRole("dialog", { name: "Search", exact: true });
  await search.getByRole("combobox", { name: "Enter search query" }).fill("Create a task");
  await search.getByRole("option", { name: /Operation: Create a task/ }).click();
  await expect(search).toBeHidden();
  await expect(page.getByRole("heading", { name: "Create a task", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#tag\/tasks\/POST\/v1\/tasks$/);
  expect(errors).toEqual([]);
  expect(unexpectedExternalRequests).toEqual([]);
});

test("executes same-origin reads and mutations in Scalar and shares results with RPC", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  let title = `Scalar ${testInfo.project.name} ${crypto.randomUUID()}`;
  await page.goto("/api/docs");
  const origin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "Test Request (get /v1/tasks)", exact: true }).click();
  const client = page.getByRole("dialog", { name: "API Client", exact: true });
  const read = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === origin &&
      url.pathname === "/api/v1/tasks" &&
      response.request().method() === "GET"
    );
  });
  await client.getByRole("button", { name: /^Send get request to/ }).click();
  const listed = await read;
  expect(listed.status()).toBe(200);
  expect(new URL(listed.url()).searchParams.get("status")).toBe("all");
  expect(await listed.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "explore" })]),
  );
  await expect(client.getByRole("link", { name: "200 OK", exact: true })).toBeVisible();
  await client.getByRole("button", { name: "Close Client", exact: true }).click();

  await page.getByRole("button", { name: "Test Request (post /v1/tasks)", exact: true }).click();
  await client
    .getByRole("region", { name: "Request: Create a task", exact: true })
    .getByRole("textbox")
    .fill(JSON.stringify({ title }));
  const create = page.waitForResponse(
    (response) =>
      response.url() === `${origin}/api/v1/tasks` && response.request().method() === "POST",
  );
  await client.getByRole("button", { name: /^Send post request to/ }).click();
  const created = await create;
  expect(created.status()).toBe(201);
  const createdTask = await created.json();
  expect(createdTask).toMatchObject({ title, completed: false });
  await expect(client.getByRole("link", { name: "201 Created", exact: true })).toBeVisible();
  await client.getByRole("button", { name: "Close Client", exact: true }).click();
  await expect(client).toBeHidden();

  await page.goto("/api/docs#tag/tasks/PATCH/v1/tasks/{id}/title");
  await page
    .getByRole("button", { name: "Test Request (patch /v1/tasks/{id}/title)", exact: true })
    .click();
  const editRequest = client.getByRole("region", {
    name: "Request: Edit a task title",
    exact: true,
  });
  await editRequest
    .getByRole("row")
    .filter({ has: page.getByRole("checkbox", { name: "Include id in request", exact: true }) })
    .getByRole("combobox", { name: "Value", exact: true })
    .fill(createdTask.id);
  title = `Edited ${title}`;
  await editRequest.getByRole("textbox").fill(JSON.stringify({ title: `  ${title}  ` }));
  const update = page.waitForResponse(
    (response) =>
      response.url() === `${origin}/api/v1/tasks/${createdTask.id}/title` &&
      response.request().method() === "PATCH",
  );
  await client.getByRole("button", { name: /^Send patch request to/ }).click();
  const updated = await update;
  expect(updated.status()).toBe(200);
  expect(updated.headers()["cache-control"]).toBe("no-store");
  expect(await updated.json()).toEqual({ ...createdTask, title });
  createdTask.title = title;
  await expect(client.getByRole("link", { name: "200 OK", exact: true })).toBeVisible();

  await page.goto("/playground");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();
  const rpc = page.waitForResponse(/\/api\/rpc\/tasks\/list(?:\?|$)/);
  await page.getByRole("button", { name: "Active", exact: true }).click();
  expect((await rpc).ok()).toBe(true);
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toBeVisible();

  // Scalar renders later operations lazily; navigate to the documented operation first.
  await page.goto("/api/docs#tag/tasks/DELETE/v1/tasks/{id}");
  await page
    .getByRole("button", { name: "Test Request (delete /v1/tasks/{id})", exact: true })
    .click();
  const target = `${origin}/api/v1/tasks/${createdTask.id}`;
  await client
    .getByRole("region", { name: "Request: Delete a task", exact: true })
    .getByRole("row")
    .filter({ has: page.getByRole("checkbox", { name: "Include id in request", exact: true }) })
    .getByRole("combobox", { name: "Value", exact: true })
    .fill(createdTask.id);
  const remove = page.waitForResponse(
    (response) => response.url() === target && response.request().method() === "DELETE",
  );
  await client.getByRole("button", { name: /^Send delete request to/ }).click();
  const deleted = await remove;
  expect(deleted.status()).toBe(200);
  expect(deleted.headers()["cache-control"]).toBe("no-store");
  expect(await deleted.json()).toEqual(createdTask);
  await expect(client.getByRole("link", { name: "200 OK", exact: true })).toBeVisible();

  const repeatedDelete = page.waitForResponse(
    (response) => response.url() === target && response.request().method() === "DELETE",
  );
  await client.getByRole("button", { name: /^Send delete request to/ }).click();
  const missing = await repeatedDelete;
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
  await expect(client.getByRole("link", { name: "404 Not Found", exact: true })).toBeVisible();

  await page.goto("/playground?status=active");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
  ).toHaveCount(0);
});
