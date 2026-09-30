"use client";

import { isLocale } from "@repo/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore, useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { useRouter } from "@/i18n/navigation";

// Keep the server-rendered selector disabled until React attaches its handler.
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  return (
    <select
      aria-label={t("language")}
      value={locale}
      disabled={pending || !hydrated}
      className="max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm"
      onChange={(event) => {
        const selected = event.target.value;
        if (!isLocale(selected) || selected === locale) return;
        startTransition(async () => {
          await setLocale(selected);
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
