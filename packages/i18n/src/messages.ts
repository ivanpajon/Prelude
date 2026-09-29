import type { Locale } from "./index";
import enMcp from "./messages/en/mcp.json";
import enPwa from "./messages/en/pwa.json";
import enSite from "./messages/en/site.json";
import enTasks from "./messages/en/tasks.json";
import esMcp from "./messages/es/mcp.json";
import esPwa from "./messages/es/pwa.json";
import esSite from "./messages/es/site.json";
import esTasks from "./messages/es/tasks.json";

export const englishMessages = { ...enSite, Tasks: enTasks, Mcp: enMcp, Pwa: enPwa };
export type Messages = typeof englishMessages;
const spanishMessages: Messages = { ...esSite, Tasks: esTasks, Mcp: esMcp, Pwa: esPwa };
export function getMessages(locale: Locale): Messages {
  return locale === "es" ? spanishMessages : englishMessages;
}
