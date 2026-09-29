"use client";

import { isLocale, LOCALE_COOKIE, localeCookieMaxAge } from "@repo/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={t("language")}
      value={locale}
      disabled={pending}
      className="max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm"
      onChange={(event) => {
        const selected = event.target.value;
        if (!isLocale(selected) || selected === locale) return;
        startTransition(() => {
          // biome-ignore lint/suspicious/noDocumentCookie: Match next-intl's preference cookie across supported browsers.
          document.cookie = `${LOCALE_COOKIE}=${selected}; Path=/; Max-Age=${localeCookieMaxAge}; SameSite=Lax`;
          // Refresh this URL directly: a prefixed redirect can drop its fragment.
          router.refresh();
        });
      }}
    >
      <option value="en" lang="en">
        English
      </option>
      <option value="es" lang="es">
        Español
      </option>
    </select>
  );
}
