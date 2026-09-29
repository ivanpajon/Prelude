import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function SiteHeader({ activePage }: { activePage?: "playground" }) {
  return (
    <header className="flex min-h-24 items-center justify-between gap-4 border-b border-border py-4">
      <Link
        href="/"
        className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        aria-label="Prelude home"
      >
        <Image
          src="/branding/prelude-logo.png"
          alt="Prelude"
          width={2027}
          height={776}
          className="h-auto w-36 sm:w-44"
          unoptimized
          preload
        />
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-6"
      >
        <Link
          href="/playground"
          aria-current={activePage === "playground" ? "page" : undefined}
          className="rounded-sm py-1 text-xs whitespace-nowrap text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-sm"
        >
          Playground
        </Link>
        <a
          href="/api/docs"
          className="rounded-sm py-1 text-xs whitespace-nowrap text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-sm"
        >
          API docs
        </a>
        <a
          href="https://nextjs.org/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-sm py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-sm"
        >
          Next.js docs
          <ArrowUpRightIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </nav>
    </header>
  );
}
