import "@repo/ui/styles/globals.css";
import { locales } from "@repo/i18n";
import { Toaster } from "@repo/ui/components/toast";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { PwaProvider } from "@/components/pwa-provider";
import { isRoutingMode, routingModes } from "@/i18n/routing";
import { RoutingPreferenceProvider } from "@/i18n/routing-preference-provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    applicationName: "Prelude",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Prelude" },
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#20382a" };

export function generateStaticParams() {
  return routingModes.flatMap((routingMode) => locales.map((locale) => ({ routingMode, locale })));
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const mode = await rootParams.routingMode();
  if (!isRoutingMode(mode)) notFound();
  const locale = await getLocale();
  const t = await getTranslations("Common");
  const pwa = await getTranslations("Pwa");
  const { Common, Tasks, Mcp, Animation, Pwa, Errors } = await getMessages();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          {t("skip")}
        </a>
        <NextIntlClientProvider messages={{ Common, Tasks, Mcp, Animation, Pwa, Errors }}>
          <RoutingPreferenceProvider mode={mode}>
            <Toaster dismissLabel={pwa("toastClose")} regionLabel={pwa("toastRegion")} />
            <PwaProvider>
              <Providers>{children}</Providers>
            </PwaProvider>
          </RoutingPreferenceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
