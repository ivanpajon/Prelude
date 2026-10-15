import { defaultLocale, LOCALE_COOKIE, localeCookieMaxAge, locales } from "@repo/i18n";
import { defineRouting } from "next-intl/routing";
import type { RoutingMode } from "./routing-settings";

export {
  DEFAULT_ROUTING_MODE,
  ROUTING_DEMO_ENABLED,
  type RoutingMode,
  type RoutingSettings,
  routingModes,
  routingSettings,
} from "./routing-settings";
export const ROUTING_MODE_COOKIE = "NEXT_LOCALE_ROUTING";

export function isRoutingMode(value: unknown): value is RoutingMode {
  return value === "always" || value === "never";
}

const shared = {
  locales,
  defaultLocale,
  localeCookie: {
    name: LOCALE_COOKIE,
    path: "/",
    sameSite: "lax" as const,
    maxAge: localeCookieMaxAge,
  },
};

export const routingByMode = {
  always: defineRouting({ ...shared, localePrefix: "always", alternateLinks: true }),
  never: defineRouting({ ...shared, localePrefix: "never", alternateLinks: false }),
};
