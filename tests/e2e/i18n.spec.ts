import { expect, test } from "@playwright/test";
import { localizationAcceptance } from "../i18n-scenarios";

localizationAcceptance();

test("isolates server-rendered language by request and honors cookie precedence", async ({
  browser,
  baseURL,
  request,
}) => {
  const contexts = await Promise.all(
    ["es-ES", "en-US", "fr-FR"].map((locale) =>
      browser.newContext({ locale, javaScriptEnabled: false, serviceWorkers: "block" }),
    ),
  );
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map((page) => page.goto(`${baseURL}/`)));
    for (const [index, page] of pages.entries()) {
      await expect(page.locator("html")).toHaveAttribute("lang", index === 0 ? "es" : "en");
      await expect(page.getByRole("heading", { level: 1, includeHidden: true })).toHaveText(
        index === 0 ? /Menos configuración/ : /Less setup/,
      );
    }
    const spanish = contexts[0];
    const page = pages[0];
    if (!spanish || !page || !baseURL) throw new Error("Missing language context");
    await spanish.addCookies([{ name: "PRELUDE_LOCALE", value: "en", url: baseURL }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await spanish.addCookies([{ name: "PRELUDE_LOCALE", value: "invalid", url: baseURL }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const response = await request.get("/", { headers: { "accept-language": "es" } });
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("localizes the dynamic manifest while preserving API identifiers and task data", async ({
  request,
}) => {
  const [english, spanish] = await Promise.all([
    request.get("/manifest.webmanifest", { headers: { cookie: "PRELUDE_LOCALE=en" } }),
    request.get("/manifest.webmanifest", { headers: { cookie: "PRELUDE_LOCALE=es" } }),
  ]);
  const en = await english.json();
  const es = await spanish.json();
  expect(en.lang).toBe("en");
  expect(es.lang).toBe("es");
  expect(es.description).not.toBe(en.description);
  for (const key of ["id", "name", "short_name", "start_url", "scope", "icons"])
    expect(es[key]).toEqual(en[key]);
  expect(spanish.headers()["cache-control"]).toContain("no-store");
  const [enTasks, esTasks] = await Promise.all([
    request.get("/api/v1/tasks?status=all", { headers: { "accept-language": "en" } }),
    request.get("/api/v1/tasks?status=all", { headers: { "accept-language": "es" } }),
  ]);
  expect(await enTasks.json()).toEqual(await esTasks.json());
  const spec = await (
    await request.get("/api/openapi.json", { headers: { "accept-language": "es" } })
  ).json();
  expect(spec.info.title).toBe("Prelude API");
  expect(spec.paths["/v1/tasks"].get.operationId).toBe("listTasks");
});

test("hydrates Spanish tasks without immediately fetching them again", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "es-ES", serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/rpc\/tasks\/list/.test(request.url())) requests.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/playground`);
    await expect(page.getByRole("list", { name: "Tareas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Vista compacta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Vista compacta", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
