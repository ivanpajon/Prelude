"use server";

import { isLocale, LOCALE_COOKIE, localeCookieMaxAge } from "@repo/i18n";
import { cookies } from "next/headers";
import {
  DEFAULT_ROUTING_MODE,
  isRoutingMode,
  ROUTING_DEMO_ENABLED,
  ROUTING_MODE_COOKIE,
} from "@/i18n/routing";

export async function setLocalePreferences({ locale, mode }: { locale: string; mode: string }) {
  if (!isLocale(locale)) throw new Error("Unsupported language");
  if (!isRoutingMode(mode) || (!ROUTING_DEMO_ENABLED && mode !== DEFAULT_ROUTING_MODE)) {
    throw new Error("Unsupported routing preference");
  }
  // Server cookie changes also invalidate pre-switch entries in the Router Cache.
  const preferences = await cookies();
  preferences.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: localeCookieMaxAge,
    sameSite: "lax",
  });
  if (mode === DEFAULT_ROUTING_MODE) {
    preferences.delete(ROUTING_MODE_COOKIE);
  } else {
    preferences.set(ROUTING_MODE_COOKIE, mode, { path: "/", sameSite: "lax", httpOnly: true });
  }
}
