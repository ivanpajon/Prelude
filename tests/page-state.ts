import type { Page } from "@playwright/test";
import { site } from "../apps/web/src/site";

/** Accessible names of the header's home link, built from the site name as the catalogs do. */
export const homeLinkName = { en: `${site.name} home`, es: `Inicio de ${site.name}` } as const;

/** Marks the current document, so a later check can tell whether the page reloaded. */
export async function markDocument(page: Page) {
  const id = crypto.randomUUID();
  await page.evaluate((value) => Reflect.set(window, "testDocumentId", value), id);
  return id;
}

/** Returns the mark from `markDocument`, or undefined after the document loads again. */
export function documentMark(page: Page) {
  return page.evaluate(() => Reflect.get(window, "testDocumentId") as string | undefined);
}
