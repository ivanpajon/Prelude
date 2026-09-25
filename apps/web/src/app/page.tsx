import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ArrowDownIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
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
        <a
          href="/"
          className="text-sm font-semibold tracking-widest"
          aria-label="Next Template home"
        >
          NEXT <span className="px-1 text-muted-foreground">/</span> TEMPLATE
        </a>
        <a
          href="https://nextjs.org/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
        <p>A foundation, with room for your point of view.</p>
        <p>Built to be made yours.</p>
      </footer>
    </div>
  );
}
