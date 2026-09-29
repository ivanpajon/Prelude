import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent } from "@repo/ui/components/card";
import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { McpPlayground } from "@/components/mcp-playground";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TaskWorkbenchServer } from "@/components/task-workbench-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Playground");
  return { title: t("metaTitle"), description: t("metaDescription") };
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
          <Badge variant="secondary" className="mb-6 rounded-full px-3 py-1.5 font-medium">
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
                className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
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
              <p role="status" className="rounded-xl bg-card p-8 text-muted-foreground">
                {t("loading")}
              </p>
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
          <Card className="bg-card shadow-none">
            <CardContent className="p-6 sm:p-8">
              <Badge variant="secondary">MCP App</Badge>
              <h3 className="mt-4 text-lg font-medium">{t("widgetTitle")}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t.rich("widgetDescription", {
                  endpoint: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
                  tool: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
                })}
              </p>
              {process.env.NODE_ENV === "development" ? (
                <>
                  <a
                    href="/api/mcp/inspector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    {t("openInspector")}
                    <ArrowUpRightIcon className="size-4" aria-hidden="true" />
                    <span className="sr-only">{common("newTab")}</span>
                  </a>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t("inspectorHelp")}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
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
