import type { Locale } from "./index";
import en from "./messages/en/widget.json";
import es from "./messages/es/widget.json";

export function getWidgetMessages(locale: Locale): { Widget: typeof en } {
  return { Widget: locale === "es" ? es : en };
}
