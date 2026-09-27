import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ArrowDownIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AnimationExamples } from "@/components/animation-examples";
import { TaskWorkbenchServer } from "@/components/task-workbench-server";

const boundaries = [
  {
    number: "01",
    title: "Start with the interface.",
    description:
      "Shared components, accessible primitives, and one set of design tokens. Make it yours without starting over.",
    label: "@repo/ui",
  },
  {
    number: "02",
    title: "Keep the contract clear.",
    description:
      "Define the shape of your data before the implementation. Browser-safe contracts connect both sides of your app.",
    label: "@repo/contracts",
  },
  {
    number: "03",
    title: "Give the server its space.",
    description:
      "Business logic and data access have a home of their own. Build the product without coupling it to the page.",
    label: "@repo/api",
  },
];

async function StackOverview() {
  "use cache";
  cacheLife("hours");

  const stack = [
    ["React 19 + Next.js 16", "Application"],
    ["shadcn/ui + Base UI", "Components"],
    ["Tailwind CSS 4 + cn", "Styling"],
    ["Turbopack + Cache Components", "Rendering"],
  ];

  return (
    <Card className="h-full border-border bg-card shadow-none">
      <CardHeader className="gap-4 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base font-medium">A solid starting point</CardTitle>
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The foundations are connected. Your next idea belongs on top.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {stack.map(([name, purpose]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <dt className="text-sm font-medium">{name}</dt>
              <dd className="text-xs text-muted-foreground">{purpose}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckIcon className="size-3.5" aria-hidden="true" />
          Public stack information cached for one hour
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <header className="flex h-24 items-center justify-between gap-4 border-b border-border">
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
        <a
          href="https://nextjs.org/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
        >
          Next.js docs
          <ArrowUpRightIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </header>

      <main id="main-content" className="pb-16">
        <section
          className="grid gap-12 py-16 lg:grid-cols-5 lg:items-center lg:gap-16 lg:py-24"
          aria-labelledby="hero-heading"
        >
          <div className="lg:col-span-3">
            <Badge variant="secondary" className="mb-6 gap-2 rounded-full px-3 py-1.5 font-medium">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Your next project starts here
            </Badge>
            <h1
              id="hero-heading"
              className="max-w-2xl text-5xl leading-tight font-medium tracking-tight sm:text-6xl lg:text-7xl"
            >
              Less setup.
              <br />
              More building.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              A thoughtful starting point for the ideas you want to ship. The essentials, already
              working together.
            </p>
            <a
              href="#workbench"
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Explore your workspace
              <ArrowDownIcon className="size-4" aria-hidden="true" />
            </a>
          </div>
          <div className="lg:col-span-2">
            <Suspense
              fallback={
                <div
                  className="h-80 animate-pulse rounded-xl bg-muted"
                  role="status"
                  aria-label="Loading stack overview"
                />
              }
            >
              <StackOverview />
            </Suspense>
          </div>
        </section>

        <section id="workbench" className="scroll-mt-8" aria-labelledby="workbench-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Make something happen
              </p>
              <h2
                id="workbench-heading"
                className="text-2xl font-medium tracking-tight sm:text-3xl"
              >
                Your workspace, ready.
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">apps/web</span>
          </div>
          <Suspense
            fallback={
              <p role="status" className="rounded-xl bg-card p-8 text-muted-foreground">
                Loading your workspace…
              </p>
            }
          >
            <TaskWorkbenchServer searchParams={searchParams} />
          </Suspense>
        </section>

        <AnimationExamples />

        <section
          className="mt-16 border-t border-border pt-10"
          aria-labelledby="architecture-heading"
        >
          <h2 id="architecture-heading" className="mb-8 text-sm font-medium text-muted-foreground">
            Room to grow. A place for everything.
          </h2>
          <div className="grid gap-8 md:grid-cols-3 md:gap-10">
            {boundaries.map((boundary) => (
              <article key={boundary.number}>
                <p className="mb-4 font-mono text-xs text-muted-foreground">{boundary.number}</p>
                <h3 className="text-base font-medium">{boundary.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {boundary.description}
                </p>
                <p className="mt-5 font-mono text-xs">{boundary.label}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-6 text-xs text-muted-foreground">
        <p>Made with ❤️ by Ivan Pajon</p>
        <a
          href="https://github.com/ivanpajon/Prelude"
          target="_blank"
          rel="noreferrer"
          aria-label="Prelude on GitHub (opens in a new tab)"
          className="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {/* GitHub's Octicons mark; license in docs/licenses/octicons.txt. */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-5" aria-hidden="true">
            <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
          </svg>
        </a>
      </footer>
    </div>
  );
}
