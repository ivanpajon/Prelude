"use client";

import { isLocale, type Locale, locales } from "@repo/i18n";
import { useTranslations } from "next-intl";
import { useFocusAfterChange, useRoutingPreference } from "@/i18n/routing-preference-provider";

/** Each language names itself, so visitors find theirs in any interface language. */
const languageNames: Record<Locale, string> = { en: "English", es: "Español" };

export function LanguageSelector() {
  const t = useTranslations("Common");
  const { locale, disabled, pending, failure, changeLocale } = useRoutingPreference();
  const focusRef = useFocusAfterChange("locale");
  // A site with one language has nothing to choose.
  if (locales.length < 2) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <select
        ref={focusRef}
        aria-label={t("language")}
        value={locale}
        disabled={disabled}
        aria-busy={pending}
        className="max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm"
        onChange={(event) => {
          const selected = event.target.value;
          if (isLocale(selected)) changeLocale(selected);
        }}
      >
        {locales.map((option) => (
          <option key={option} value={option} lang={option}>
            {languageNames[option]}
          </option>
        ))}
      </select>
      {pending && (
        <span className="sr-only" role="status">
          {t("preferenceSaving")}
        </span>
      )}
      {failure === "locale" && (
        <p role="alert" className="max-w-64 text-xs text-destructive">
          {t("preferenceError")}
        </p>
      )}
    </div>
  );
}
