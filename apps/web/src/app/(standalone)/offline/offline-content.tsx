"use client";

import { browserLocale, defaultLocale, type Locale } from "@repo/i18n";
import { getPwaMessages } from "@repo/i18n/pwa";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { site } from "@/site";

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
    document.title = `${getPwaMessages(selected).Pwa.offlineDocumentTitle} — ${site.name}`;
  }, []);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-8 py-16"
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WifiOffIcon aria-hidden="true" />
          </EmptyMedia>
          <p className="font-mono text-xs text-muted-foreground uppercase">{site.name}</p>
          <EmptyTitle>
            <h1>{messages.offlineTitle}</h1>
          </EmptyTitle>
          <EmptyDescription>{messages.offlineDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The worker serves this page at the address that failed, so reload that address. */}
          <a
            href="/"
            onClick={(event) => {
              // Modified clicks keep the link, and the /offline address itself has nothing to retry.
              const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
              if (event.button !== 0 || modified || window.location.pathname === "/offline") return;
              event.preventDefault();
              window.location.reload();
            }}
            className={buttonVariants()}
          >
            {messages.offlineAction}
          </a>
        </EmptyContent>
      </Empty>
    </main>
  );
}
