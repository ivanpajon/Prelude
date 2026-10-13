import type { Locale } from "./index";
import en from "./messages/en/pwa.json";
import es from "./messages/es/pwa.json";

const catalogs: Record<Locale, typeof en> = { en, es };

/** Offline clients only need this namespace, avoiding the full website catalogs. */
export function getPwaMessages(locale: Locale): { Pwa: typeof en } {
  return { Pwa: catalogs[locale] };
}
