"use client";

import { isLocale } from "@repo/i18n";
import { useTranslations } from "next-intl";
import { useRoutingPreference } from "@/i18n/routing-preference-provider";

export function LanguageSelector() {
  const t = useTranslations("Common");
  const { locale, disabled, pending, failure, changeLocale } = useRoutingPreference();
  return (
    <div className="flex flex-col items-end gap-1">
      <select
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
        <option value="en" lang="en">
          English
        </option>
        <option value="es" lang="es">
          Español
        </option>
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
