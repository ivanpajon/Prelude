import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { McpPlayground } from "@/components/mcp-playground";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TaskWorkbenchServer } from "@/components/task-workbench-server";
import { site } from "@/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Playground");
  return {
    title: `${t("metaTitle")} — ${site.name}`,
    description: t("metaDescription", { name: site.name }),
  };
}

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Playground");
  const common = await getTranslations("Common");
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <SiteHeader activePage="playground" />

      <main id="main-content" className="pb-16">
        <section className="py-16 lg:py-20" aria-labelledby="playground-heading">
          <Badge variant="secondary" className="mb-6">
            {t("eyebrow")}
          </Badge>
          <h1 id="playground-heading" className="text-4xl font-medium tracking-tight sm:text-5xl">
            {t("heading")}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("intro")}
          </p>
          <nav aria-label={t("navigation")} className="mt-8 flex flex-wrap gap-3">
            {[
              ["#tasks", t("tasks")],
              ["#mcp", t("mcp")],
              ["#mcp-app", t("mcpApp")],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {label}
              </a>
            ))}
          </nav>
        </section>

        <section id="tasks" className="scroll-mt-8" aria-labelledby="workbench-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                {t("workbenchEyebrow")}
              </p>
              <h2
                id="workbench-heading"
                className="text-2xl font-medium tracking-tight sm:text-3xl"
              >
                {t("workbenchHeading")}
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">apps/web</span>
          </div>
          <Suspense
            fallback={
              <div className="space-y-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {t("loading")}
                </p>
                <Skeleton className="h-64" aria-hidden="true" />
              </div>
            }
          >
            <TaskWorkbenchServer searchParams={searchParams} />
          </Suspense>
        </section>

        <McpPlayground />

        <section id="mcp-app" className="mt-16 scroll-mt-8" aria-labelledby="mcp-app-heading">
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {t("widgetEyebrow")}
            </p>
            <h2 id="mcp-app-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
              {t("widgetHeading")}
            </h2>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>{t("widgetTitle")}</h3>
              </CardTitle>
              <CardDescription className="max-w-2xl">
                {t.rich("widgetDescription", {
                  endpoint: (chunks) => <code className="font-mono">{chunks}</code>,
                  tool: (chunks) => <code className="font-mono">{chunks}</code>,
                })}
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">MCP App</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {process.env.NODE_ENV === "development" ? (
                <>
                  <a
                    href="/api/mcp/inspector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants()}
                  >
                    {t("openInspector")}
                    <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
                    <span className="sr-only">{common("newTab")}</span>
                  </a>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t("inspectorHelp")}
                  </p>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("connectionHelp")}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
