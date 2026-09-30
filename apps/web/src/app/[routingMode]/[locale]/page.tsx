import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AnimationExamples } from "@/components/animation-examples";
import { RoutingModeSwitch } from "@/components/routing-mode-switch";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";

const boundaries = [
  {
    number: "01",
    title: "uiTitle",
    description: "uiDescription",
    label: "@repo/ui",
  },
  {
    number: "02",
    title: "contractsTitle",
    description: "contractsDescription",
    label: "@repo/contracts",
  },
  {
    number: "03",
    title: "apiTitle",
    description: "apiDescription",
    label: "@repo/api",
  },
] as const;

async function StackOverview() {
  "use cache";
  cacheLife("hours");
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");

  const stack = [
    ["React 19 + Next.js 16", t("application")],
    ["shadcn/ui + Base UI", t("components")],
    ["Tailwind CSS 4 + cn", t("styling")],
    ["Turbopack + Cache Components", t("rendering")],
  ];

  return (
    <Card className="h-full border-border bg-card shadow-none">
      <CardHeader className="gap-4 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base font-medium">{t("stackTitle")}</CardTitle>
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("stackDescription")}</p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {stack.map(([name, purpose]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <dt className="text-sm font-medium">{name}</dt>
              <dd className="text-xs text-muted-foreground">{purpose}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <dt className="text-sm font-medium">i18n · next-intl</dt>
            <dd>
              <RoutingModeSwitch />
            </dd>
          </div>
        </dl>
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border-t border-border py-4 text-sm font-medium transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span>OpenAPI + Scalar</span>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            {common("apiDocs")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{common("newTab")}</span>
          </span>
        </a>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckIcon className="size-3.5" aria-hidden="true" />
          {t("cached")}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function HomePage() {
  const t = await getTranslations("Home");
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <SiteHeader />

      <main id="main-content" className="pb-16">
        <section
          className="grid gap-12 py-16 lg:grid-cols-5 lg:items-center lg:gap-16 lg:py-24"
          aria-labelledby="hero-heading"
        >
          <div className="lg:col-span-3">
            <Badge variant="secondary" className="mb-6 gap-2 rounded-full px-3 py-1.5 font-medium">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t("eyebrow")}
            </Badge>
            <h1
              id="hero-heading"
              className="max-w-2xl text-5xl leading-tight font-medium tracking-tight sm:text-6xl lg:text-7xl"
            >
              {t("headline1")}
              <br />
              {t("headline2")}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("intro")}
            </p>
            <Link
              href="/playground"
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {t("openPlayground")}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="lg:col-span-2">
            <Suspense
              fallback={
                <div
                  className="h-80 animate-pulse rounded-xl bg-muted"
                  role="status"
                  aria-label={t("stackLoading")}
                />
              }
            >
              <StackOverview />
            </Suspense>
          </div>
        </section>

        <AnimationExamples />

        <section
          className="mt-16 border-t border-border pt-10"
          aria-labelledby="architecture-heading"
        >
          <h2 id="architecture-heading" className="mb-8 text-sm font-medium text-muted-foreground">
            {t("architecture")}
          </h2>
          <div className="grid gap-8 md:grid-cols-3 md:gap-10">
            {boundaries.map((boundary) => (
              <article key={boundary.number}>
                <p className="mb-4 font-mono text-xs text-muted-foreground">{boundary.number}</p>
                <h3 className="text-base font-medium">{t(boundary.title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(boundary.description)}
                </p>
                <p className="mt-5 font-mono text-xs">{boundary.label}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
