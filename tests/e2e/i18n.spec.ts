import { expect, test } from "@playwright/test";
import { ROUTING_DEMO_ENABLED } from "../../apps/web/src/i18n/routing-settings";
import { apiInfo } from "../../apps/web/src/lib/api-info";
import { defaultLocale } from "../../packages/i18n/src/index";
import { localizationAcceptance, skipWithoutRoutingSwitch } from "../i18n-scenarios";
import { homeLinkName } from "../page-state";

localizationAcceptance();

test("isolates server-rendered language and negotiates only unprefixed entries", async ({
  browser,
  baseURL,
  request,
}) => {
  // This case exercises concurrent browsers plus several preference navigations.
  test.setTimeout(60_000);
  // qaa is a private-use language code that no site supports, so it gets the default language.
  const browsers = [
    ["es-ES", "es"],
    ["en-US", "en"],
    ["qaa-QM", defaultLocale],
  ] as const;
  const contexts = await Promise.all(
    browsers.map(([locale]) => browser.newContext({ locale, javaScriptEnabled: false })),
  );
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map((page) => page.goto(`${baseURL}/`)));
    for (const [index, [, expected]] of browsers.entries()) {
      const page = pages[index];
      if (!page) throw new Error("Missing language page");
      await expect(page.locator("html")).toHaveAttribute("lang", expected);
      await expect(page).toHaveURL(`${baseURL}/${expected}`);
      await expect(
        page.getByRole("combobox", {
          name: expected === "es" ? "Idioma" : "Language",
          exact: true,
          includeHidden: true,
        }),
      ).toHaveCount(1);
    }
    const spanish = contexts[0];
    const page = pages[0];
    if (!spanish || !page || !baseURL) throw new Error("Missing language context");
    await spanish.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.goto(`${baseURL}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await spanish.addCookies([{ name: "NEXT_LOCALE", value: "invalid", url: baseURL }]);
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
      // The hidden variant needs the visitor override cookie.
      if (mode === "never") skipWithoutRoutingSwitch();
      const context = await browser.newContext({
        javaScriptEnabled: false,
        locale: locale === "en" ? "es-ES" : "en-US",
      });
      try {
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL },
          { name: "NEXT_LOCALE_ROUTING", value: "never", url: baseURL },
        ]);
        const page = await context.newPage();
        await page.goto(mode === "always" ? `/${locale}` : "/");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const toggle = page.getByRole("switch", {
          name: locale === "en" ? "Language in URL" : "Idioma en la URL",
          exact: true,
          includeHidden: true,
        });
        if (!ROUTING_DEMO_ENABLED) await expect(toggle).toHaveCount(0);
        else {
          await expect(toggle).toBeDisabled();
          if (mode === "always") await expect(toggle).toBeChecked();
          else await expect(toggle).not.toBeChecked();
        }
        await expect(
          page.getByRole("link", {
            name: homeLinkName[locale],
            exact: true,
            includeHidden: true,
          }),
        ).toHaveAttribute("href", mode === "always" ? `/${locale}` : "/");
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
    headers: { cookie: "NEXT_LOCALE=en; NEXT_LOCALE_ROUTING=never" },
    maxRedirects: 0,
  });
  expect(explicit.status()).toBe(200);
  expect(explicit.headers().location).toBeUndefined();
  expect(explicit.headers()["set-cookie"]).toBeUndefined();
  expect(explicit.headers()["x-robots-tag"]).toBeUndefined();
  expect(explicit.headers().link).toContain('hreflang="en"');
  expect(explicit.headers().link).toContain('hreflang="es"');
  expect(await explicit.text()).toContain('lang="es"');

  // routingSettings.demoEnabled: false ignores the visitor override cookie.
  if (ROUTING_DEMO_ENABLED) {
    const hidden = await request.get("/", {
      headers: { cookie: "NEXT_LOCALE=es; NEXT_LOCALE_ROUTING=never" },
      maxRedirects: 0,
    });
    expect(hidden.status()).toBe(200);
    expect(hidden.headers()["cache-control"]).toContain("private");
    expect(hidden.headers()["cache-control"]).toContain("no-store");
    expect(hidden.headers()["x-robots-tag"]).toContain("noindex");
    expect(hidden.headers().link ?? "").not.toMatch(/hreflang=|rel="alternate"/);
    expect(await hidden.text()).toContain('lang="es"');
  }

  const invalid = await request.get("/?probe=1", {
    headers: { cookie: "NEXT_LOCALE=en; NEXT_LOCALE_ROUTING=invalid" },
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

test("localizes the dynamic manifest while keeping API responses language-neutral", async ({
  request,
}) => {
  const [english, spanish] = await Promise.all([
    request.get("/manifest.webmanifest", { headers: { cookie: "NEXT_LOCALE=en" } }),
    request.get("/manifest.webmanifest", { headers: { cookie: "NEXT_LOCALE=es" } }),
  ]);
  const en = await english.json();
  const es = await spanish.json();
  expect(en.lang).toBe("en");
  expect(es.lang).toBe("es");
  expect(es.description).not.toBe(en.description);
  for (const key of ["id", "name", "short_name", "start_url", "scope", "icons"])
    expect(es[key]).toEqual(en[key]);
  expect(spanish.headers()["cache-control"]).toContain("no-store");
  const [enHealth, esHealth] = await Promise.all([
    request.get("/api/health", { headers: { "accept-language": "en" } }),
    request.get("/api/health", { headers: { "accept-language": "es" } }),
  ]);
  expect(await enHealth.json()).toEqual(await esHealth.json());
  const [enSpec, esSpec] = await Promise.all([
    request.get("/api/openapi.json", { headers: { "accept-language": "en" } }),
    request.get("/api/openapi.json", { headers: { "accept-language": "es" } }),
  ]);
  const spec = await esSpec.json();
  expect(spec.info.title).toBe(apiInfo.title);
  expect(spec).toEqual(await enSpec.json());
});
