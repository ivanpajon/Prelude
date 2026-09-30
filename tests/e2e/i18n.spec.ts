import { expect, test } from "@playwright/test";
import { localizationAcceptance } from "../i18n-scenarios";

localizationAcceptance();

test("isolates server-rendered language and negotiates only unprefixed entries", async ({
  browser,
  baseURL,
  request,
}) => {
  // This case exercises concurrent browsers plus several preference navigations.
  test.setTimeout(60_000);
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
      await expect(page).toHaveURL(`${baseURL}/${index === 0 ? "es" : "en"}`);
      await expect(page.getByRole("heading", { level: 1, includeHidden: true })).toHaveText(
        index === 0 ? /Menos configuración/ : /Less setup/,
      );
    }
    const spanish = contexts[0];
    const page = pages[0];
    if (!spanish || !page || !baseURL) throw new Error("Missing language context");
    await spanish.addCookies([{ name: "PRELUDE_LOCALE", value: "en", url: baseURL }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.goto(`${baseURL}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await spanish.addCookies([{ name: "PRELUDE_LOCALE", value: "invalid", url: baseURL }]);
    await page.goto(`${baseURL}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const response = await request.get("/", {
      headers: { "accept-language": "es" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

for (const locale of ["en", "es"] as const) {
  for (const mode of ["always", "never"] as const) {
    test(`renders ${mode}/${locale} links and controls before hydration`, async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("Missing production URL");
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false,
        serviceWorkers: "block",
        locale: locale === "en" ? "es-ES" : "en-US",
      });
      try {
        await context.addCookies([
          { name: "PRELUDE_LOCALE", value: locale, url: baseURL },
          { name: "PRELUDE_LOCALE_ROUTING", value: "never", url: baseURL },
        ]);
        const page = await context.newPage();
        await page.goto(mode === "always" ? `/${locale}` : "/");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const toggle = page.getByRole("switch", {
          name: locale === "en" ? "Language in URL" : "Idioma en la URL",
          exact: true,
          includeHidden: true,
        });
        await expect(toggle).toBeDisabled();
        if (mode === "always") await expect(toggle).toBeChecked();
        else await expect(toggle).not.toBeChecked();
        await expect(
          page.getByRole("link", {
            name: locale === "en" ? "Open playground" : "Abrir zona de pruebas",
            exact: true,
            includeHidden: true,
          }),
        ).toHaveAttribute("href", mode === "always" ? `/${locale}/playground` : "/playground");
      } finally {
        await context.close();
      }
    });
  }
}

test("keeps explicit URLs deterministic and hidden variants private without exposing internal routes", async ({
  request,
}) => {
  const explicit = await request.get("/es", {
    headers: { cookie: "PRELUDE_LOCALE=en; PRELUDE_LOCALE_ROUTING=never" },
    maxRedirects: 0,
  });
  expect(explicit.status()).toBe(200);
  expect(explicit.headers().location).toBeUndefined();
  expect(explicit.headers()["set-cookie"]).toBeUndefined();
  expect(explicit.headers()["x-robots-tag"]).toBeUndefined();
  expect(explicit.headers().link).toContain('hreflang="en"');
  expect(explicit.headers().link).toContain('hreflang="es"');
  expect(await explicit.text()).toContain('lang="es"');

  const hidden = await request.get("/", {
    headers: { cookie: "PRELUDE_LOCALE=es; PRELUDE_LOCALE_ROUTING=never" },
    maxRedirects: 0,
  });
  expect(hidden.status()).toBe(200);
  expect(hidden.headers()["cache-control"]).toContain("private");
  expect(hidden.headers()["cache-control"]).toContain("no-store");
  expect(hidden.headers()["x-robots-tag"]).toContain("noindex");
  expect(hidden.headers().link ?? "").not.toMatch(/hreflang=|rel="alternate"/);
  expect(await hidden.text()).toContain('lang="es"');

  const invalid = await request.get("/?probe=1", {
    headers: { cookie: "PRELUDE_LOCALE=en; PRELUDE_LOCALE_ROUTING=invalid" },
    maxRedirects: 0,
  });
  expect(invalid.status()).toBe(307);
  expect(invalid.headers().location).toBe("/en?probe=1");
  for (const pathname of ["/always/en", "/never/es"]) {
    const response = await request.get(pathname);
    expect(response.status()).toBe(404);
    expect(response.headers().location).toBeUndefined();
    const html = await response.text();
    expect(html).not.toContain('href="/always/');
    expect(html).not.toContain('href="/never/');
  }
  const missing = await request.get("/en/never/es");
  expect([200, 404]).toContain(missing.status());
  expect(await missing.text()).toContain('name="robots" content="noindex"');
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
