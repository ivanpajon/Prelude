"use client";

import { browserLocale, defaultLocale, type Locale } from "@repo/i18n";
import { getPwaMessages } from "@repo/i18n/pwa";
import { WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** One static document serves every language and remains readable without JavaScript. */
export function OfflineContent() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const messages = getPwaMessages(locale).Pwa;

  useEffect(() => {
    let cookie = "";
    try {
      cookie = document.cookie;
    } catch {
      // Browser language remains available when cookie access is denied.
    }
    const selected = browserLocale(cookie, navigator.languages);
    setLocale(selected);
    document.documentElement.lang = selected;
    document.title = getPwaMessages(selected).Pwa.offlineDocumentTitle;
  }, []);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center px-8 py-16"
    >
      <div className="mb-8 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <WifiOffIcon className="size-6" aria-hidden="true" />
      </div>
      <p className="mb-3 font-mono text-xs text-muted-foreground">PRELUDE</p>
      <h1 className="text-4xl font-medium tracking-tight">{messages.offlineTitle}</h1>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground">
        {messages.offlineDescription}
      </p>
      <a
        href="/"
        className="mt-8 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {messages.offlineAction}
      </a>
    </main>
  );
}
