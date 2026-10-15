"use client";

import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16"
    >
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">{t("title")}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t("description")}</p>
      {/* The digest matches the server log entry for this error, without exposing its cause. */}
      {error.digest ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
      {/* retry() fetches the segment again from the server; reset() would only re-render it. */}
      <Button className="mt-8" onClick={() => retry()}>
        {t("retry")}
      </Button>
    </main>
  );
}
