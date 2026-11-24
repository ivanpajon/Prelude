import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ActivityIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { site } from "@/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Private");
  return {
    title: `${t("metaTitle")} — ${site.name}`,
    description: t("metaDescription", { name: site.name }),
    // An app page, not content for search engines.
    robots: { index: false, follow: false },
  };
}

// Sample figures: the page shows the layout, so nothing here comes from the API.
const stats = [
  ["statProjects", "12"],
  ["statMembers", "8"],
  ["statDeployments", "34"],
] as const;
const projects = [
  ["Aurora", "statusActive"],
  ["Borealis", "statusActive"],
  ["Cascade", "statusPaused"],
] as const;

/**
 * The layout example for app pages (a dashboard, an account area). It has no sign-in: add your
 * own check before the shell when the project gets authentication.
 */
export default async function PrivatePage() {
  const t = await getTranslations("Private");
  return (
    <AppShell page="overview" title={t("title")}>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>

      <section aria-label={t("stats")} className="grid gap-4 sm:grid-cols-3">
        {stats.map(([key, value]) => (
          <Card key={key}>
            <CardHeader>
              <CardDescription>{t(key)}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section id="projects" className="scroll-mt-16" aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="mb-4 text-lg font-medium tracking-tight">
          {t("projects")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(([name, status]) => (
            <Card key={name}>
              <CardHeader>
                <CardTitle>
                  <h3>{name}</h3>
                </CardTitle>
                <CardAction>
                  <Badge variant={status === "statusActive" ? "default" : "secondary"}>
                    {t(status)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {t("projectDescription")}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="activity" className="scroll-mt-16" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-4 text-lg font-medium tracking-tight">
          {t("activity")}
        </h2>
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("activityEmpty")}</EmptyTitle>
            <EmptyDescription>{t("activityEmptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    </AppShell>
  );
}
