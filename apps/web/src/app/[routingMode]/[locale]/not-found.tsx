import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site } from "@/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Errors");
  // Drop the heading's final period: "A fresh direction — Prelude".
  const title = t("notFoundTitle").replace(/\.$/, "");
  return { title: `${title} — ${site.name}`, description: t("notFoundDescription") };
}

export default async function NotFound() {
  const t = await getTranslations("Errors");
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16"
    >
      <p className="font-mono text-xs text-muted-foreground">{t("notFoundEyebrow")}</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">{t("notFoundTitle")}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        {t("notFoundDescription")}
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("home")}
      </Link>
    </main>
  );
}
