import { defaultLocale, LOCALE_COOKIE, localeCookieMaxAge, locales } from "@repo/i18n";
import { defineRouting } from "next-intl/routing";

export const routingModes = ["always", "never"] as const;
export type RoutingMode = (typeof routingModes)[number];
export type RoutingSettings = { defaultMode: RoutingMode; demoEnabled: boolean };

// Consumer configuration: disable the demo to enforce one routing policy.
export const routingSettings: RoutingSettings = { defaultMode: "always", demoEnabled: true };
export const DEFAULT_ROUTING_MODE = routingSettings.defaultMode;
export const ROUTING_DEMO_ENABLED = routingSettings.demoEnabled;
export const ROUTING_MODE_COOKIE = "PRELUDE_LOCALE_ROUTING";

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
