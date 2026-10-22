"use client";

import { isLocale, type Locale, locales } from "@repo/i18n";
import { FieldError } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
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
      <NativeSelect
        ref={focusRef}
        aria-label={t("language")}
        value={locale}
        // While saving, stay focusable so keyboard focus survives the request and a failure.
        disabled={disabled && !pending}
        aria-disabled={pending || undefined}
        aria-busy={pending}
        onChange={(event) => {
          const selected = event.target.value;
          if (isLocale(selected)) changeLocale(selected);
        }}
      >
        {locales.map((option) => (
          <NativeSelectOption key={option} value={option} lang={option}>
            {languageNames[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {pending && (
        <span className="sr-only" role="status">
          {t("preferenceSaving")}
        </span>
      )}
      {failure === "locale" && <FieldError className="max-w-64">{t("preferenceError")}</FieldError>}
    </div>
  );
}
