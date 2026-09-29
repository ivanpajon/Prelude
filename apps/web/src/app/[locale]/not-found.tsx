import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

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
