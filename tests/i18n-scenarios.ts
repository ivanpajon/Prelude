import { expect, test } from "@playwright/test";
import { site } from "../apps/web/src/site";
import { waitForHydration } from "./hydration";
import { documentMark, homeLinkName, markDocument } from "./page-state";

/** Localization scenarios that need only the home page and the shared layout. */
export function localizationAcceptance() {
  test("switches actual URL policies with keyboard controls and preserves document state", async ({
    page,
  }) => {
    await page.goto("/en");
    const mode = page.getByRole("switch", { name: "Language in URL", exact: true });
    // The switch is enabled after hydration, once the router no longer rewrites the URL.
    await expect(mode).toBeEnabled();
    const documentId = await page.evaluate(() => {
      const id = crypto.randomUUID();
      Reflect.set(window, "routingDocumentId", id);
      // Give both transitions query/fragment state without introducing a document load.
      history.replaceState(history.state, "", `${location.pathname}?preview=1#main-content`);
      return id;
    });
    await expect(mode).toBeChecked();
    await mode.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/\?preview=1#main-content$/);
    await expect(mode).not.toBeChecked();
    await expect(page.getByRole("link", { name: homeLinkName.en, exact: true })).toHaveAttribute(
      "href",
      "/",
    );
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveURL(/\/\?preview=1#main-content$/);
    const spanishMode = page.getByRole("switch", { name: "Idioma en la URL", exact: true });
    await spanishMode.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/es\?preview=1#main-content$/);
    await expect(spanishMode).toBeChecked();
    expect(await page.evaluate(() => Reflect.get(window, "routingDocumentId"))).toBe(documentId);
    await expect(page.getByRole("link", { name: homeLinkName.es, exact: true })).toHaveAttribute(
      "href",
      "/es",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("link", { name: "Documentación de la API", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test("persists hidden URLs until an explicit language URL is opened", async ({ page }) => {
    await page.goto("/es");
    await page.getByRole("switch", { name: "Idioma en la URL", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(
      page.getByRole("switch", { name: "Idioma en la URL", exact: true }),
    ).not.toBeChecked();
    await expect(page.getByRole("link", { name: homeLinkName.es, exact: true })).toHaveAttribute(
      "href",
      "/",
    );
    await page.goto("/?probe=1");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "?probe=1");
    await expect(
      page.getByRole("switch", { name: "Language in URL", exact: true }),
    ).not.toBeChecked();
    await page.goto("/es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("switch", { name: "Idioma en la URL", exact: true })).toBeChecked();
    await expect(page.getByRole("link", { name: homeLinkName.es, exact: true })).toHaveAttribute(
      "href",
      "/es",
    );
  });

  test("changes the explicit language route while preserving queries and anchors", async ({
    page,
  }) => {
    // A prefixed request doesn't change the saved preferences, so this load leaves no trace.
    const direct = await page.context().newPage();
    await direct.goto("/es");
    const spanishTitle = await direct.title();
    await direct.close();
    await page.goto("/en?probe=1#main-content");
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const english = await markDocument(page);
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveURL(/\/es\?probe=1#main-content$/);
    await expect(page).toHaveTitle(spanishTitle);
    await expect(
      page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("link", { name: "Documentación de la API", exact: true }),
    ).toBeVisible();
    expect(await documentMark(page)).toBe(english);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(await documentMark(page)).toBeUndefined();
    await page.getByRole("link", { name: homeLinkName.es, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/es");
    const spanish = await markDocument(page);
    await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "API docs", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/en");
    expect(await documentMark(page)).toBe(spanish);
  });

  test("localizes missing pages and keeps API documentation links usable", async ({ page }) => {
    const validationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /instant|validation boundary/i.test(message.text())) {
        validationErrors.push(message.text());
      }
    });
    await page.goto("/");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    const docs = page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Documentación de la API", exact: true });
    await expect(docs).toHaveAttribute("href", "/api/docs");
    const prefixed = await page.request.get("/es?probe=1", { maxRedirects: 0 });
    expect(prefixed.status()).toBe(200);
    expect(prefixed.headers().location).toBeUndefined();
    await page.goto("/es?probe=1");
    await expect(page).toHaveURL(/\/es\?probe=1$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    const homeHeading = (await heading.textContent()) ?? "";
    const response = await page.goto("/missing-page");
    // Production returns 404; the development server streams the page with 200.
    expect([200, 404]).toContain(response?.status());
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un nuevo rumbo.");
    await expect(page).toHaveTitle(`Un nuevo rumbo — ${site.name}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.getByRole("main").getByRole("link").click();
    await expect(heading).toHaveText(homeHeading);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(validationErrors).toEqual([]);
  });
}
