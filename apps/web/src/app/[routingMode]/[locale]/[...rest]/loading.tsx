import { Skeleton } from "@repo/ui/components/skeleton";
import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("Common");
  return (
    <main
      id="main-content"
      className="mx-auto max-w-7xl space-y-8 px-6 py-24 sm:px-10 lg:px-16"
      aria-busy="true"
    >
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
      <Skeleton className="h-16 max-w-xl" aria-hidden="true" />
      <Skeleton className="h-8 max-w-md" aria-hidden="true" />
      <Skeleton className="h-64" aria-hidden="true" />
    </main>
  );
}
