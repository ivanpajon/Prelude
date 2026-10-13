import type { Locale } from "./index";
import enPwa from "./messages/en/pwa.json";
import enSite from "./messages/en/site.json";
import esPwa from "./messages/es/pwa.json";
import esSite from "./messages/es/site.json";
// demo:start

import enMcp from "./messages/en/mcp.json";
import enTasks from "./messages/en/tasks.json";
import esMcp from "./messages/es/mcp.json";
import esTasks from "./messages/es/tasks.json";

// demo:end

export const englishMessages = {
  ...enSite,
  Pwa: enPwa,
  // demo:start
  Tasks: enTasks,
  Mcp: enMcp,
  // demo:end
};
export type Messages = typeof englishMessages;
const catalogs: Record<Locale, Messages> = {
  en: englishMessages,
  es: {
    ...esSite,
    Pwa: esPwa,
    // demo:start
    Tasks: esTasks,
    Mcp: esMcp,
    // demo:end
  },
};
export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}
