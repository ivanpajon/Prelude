import { defaultLocale, LOCALE_COOKIE, localeCookieMaxAge, locales } from "@repo/i18n";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
  alternateLinks: false,
  localeCookie: { name: LOCALE_COOKIE, path: "/", sameSite: "lax", maxAge: localeCookieMaxAge },
});
