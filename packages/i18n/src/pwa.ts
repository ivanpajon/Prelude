import type { Locale } from "./index";
import en from "./messages/en/pwa.json";
import es from "./messages/es/pwa.json";

/** Offline clients only need this namespace, avoiding the full website catalogs. */
export function getPwaMessages(locale: Locale): { Pwa: typeof en } {
  return { Pwa: locale === "es" ? es : en };
}
