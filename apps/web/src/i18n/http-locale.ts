import "server-only";
import { LOCALE_COOKIE, requestLocale } from "@repo/i18n";
import { cookies, headers } from "next/headers";

export async function getRequestLocale() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return requestLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    requestHeaders.get("accept-language"),
  );
}
