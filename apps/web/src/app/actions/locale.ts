"use server";

import { isLocale, LOCALE_COOKIE, localeCookieMaxAge } from "@repo/i18n";
import { cookies } from "next/headers";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) throw new Error("Unsupported language");
  // Server cookie changes also invalidate pre-switch entries in the Router Cache.
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: localeCookieMaxAge,
    sameSite: "lax",
  });
}
