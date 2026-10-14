import { expect, type Page } from "@playwright/test";

/**
 * Waits until React hydrates the page after a document load. A cold development compile can show
 * the server-rendered page before the client scripts run, and a click in that window is lost. The
 * header's language selector is disabled until hydration, so it signals when the page responds.
 */
export async function waitForHydration(page: Page) {
  await expect(page.getByRole("combobox", { name: /^(Language|Idioma)$/ })).toBeEnabled();
}
