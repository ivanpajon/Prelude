import type { Locale } from "./index";
import en from "./messages/en/widget.json";
import es from "./messages/es/widget.json";

const catalogs: Record<Locale, typeof en> = { en, es };

export function getWidgetMessages(locale: Locale): { Widget: typeof en } {
  return { Widget: catalogs[locale] };
}
