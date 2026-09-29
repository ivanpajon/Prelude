"use client";

import { isLocale } from "@repo/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const pathname = usePathname();
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
          router.replace(`${pathname}${window.location.search}${window.location.hash}`, {
            locale: selected,
            scroll: false,
          });
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
