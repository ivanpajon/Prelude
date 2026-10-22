import { buttonVariants } from "@repo/ui/components/button";
import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site } from "@/site";
import { LanguageSelector } from "./language-selector";
import { RoutingModeSwitch } from "./routing-mode-switch";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader(
  // demo:start
  { activePage }: { activePage?: "playground" },
  // demo:end
) {
  const t = await getTranslations("Common");
  return (
    <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-border py-4">
      <Link
        href="/"
        className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        aria-label={t("home", { name: site.name })}
      >
        <Image
          src={site.logo.src}
          alt={site.name}
          width={site.logo.width}
          height={site.logo.height}
          className="h-auto w-36 sm:w-44 dark:invert"
          unoptimized
          preload
        />
      </Link>
      <nav
        aria-label={t("navigation")}
        className="flex basis-full flex-wrap items-center gap-x-1 gap-y-2 sm:flex-1 sm:basis-auto sm:justify-end sm:gap-x-2"
      >
        {/* demo:start */}
        <Link
          href="/playground"
          aria-current={activePage === "playground" ? "page" : undefined}
          className={buttonVariants({
            variant: "ghost",
            className: "aria-[current=page]:bg-muted",
          })}
        >
          {t("playground")}
        </Link>
        {/* demo:end */}
        <a href="/api/docs" className={buttonVariants({ variant: "ghost" })}>
          {t("apiDocs")}
        </a>
        <a
          href="https://nextjs.org/docs"
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "ghost" })}
        >
          {t("nextDocs")}
          <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
          <span className="sr-only">{t("newTab")}</span>
        </a>
        <LanguageSelector />
        <RoutingModeSwitch />
        <ThemeToggle />
      </nav>
    </header>
  );
}
