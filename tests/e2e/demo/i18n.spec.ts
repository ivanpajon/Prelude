import { expect, test } from "@playwright/test";
import { demoLocalizationAcceptance } from "../../demo/i18n-scenarios";

demoLocalizationAcceptance();

for (const locale of ["en", "es"] as const) {
  for (const mode of ["always", "never"] as const) {
    test(`renders ${mode}/${locale} playground links before hydration`, async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("Missing production URL");
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

test("keeps task data and API identifiers independent of language", async ({ request }) => {
  const [enTasks, esTasks] = await Promise.all([
    request.get("/api/v1/tasks?status=all", { headers: { "accept-language": "en" } }),
    request.get("/api/v1/tasks?status=all", { headers: { "accept-language": "es" } }),
  ]);
  expect(await enTasks.json()).toEqual(await esTasks.json());
  const spec = await (
    await request.get("/api/openapi.json", { headers: { "accept-language": "es" } })
  ).json();
  expect(spec.paths["/v1/tasks"].get.operationId).toBe("listTasks");
});

test("hydrates Spanish tasks without immediately fetching them again", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "es-ES" });
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
