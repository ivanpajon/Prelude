import "@repo/ui/styles/globals.css";
import { locales } from "@repo/i18n";
import { buttonVariants } from "@repo/ui/components/button";
import { Toaster } from "@repo/ui/components/toast";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { PwaProvider } from "@/components/pwa-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { isRoutingMode, routingModes } from "@/i18n/routing";
import { RoutingPreferenceProvider } from "@/i18n/routing-preference-provider";
import { site, siteIcons } from "@/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    applicationName: site.name,
    appleWebApp: { capable: true, statusBarStyle: "default", title: site.name },
    icons: siteIcons,
  };
}

export const viewport: Viewport = { themeColor: site.colors.theme };

export function generateStaticParams() {
  return routingModes.flatMap((routingMode) => locales.map((locale) => ({ routingMode, locale })));
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const mode = await rootParams.routingMode();
  if (!isRoutingMode(mode)) notFound();
  const locale = await getLocale();
  const t = await getTranslations("Common");
  const pwa = await getTranslations("Pwa");
  const {
    Common,
    Animation,
    Pwa,
    Errors,
    // demo:start
    Tasks,
    Mcp,
    // demo:end
  } = await getMessages();
  return (
    // next-themes sets data-theme on <html> before hydration.
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <a
            href="#main-content"
            className={buttonVariants({
              className: "not-focus:sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50",
            })}
          >
            {t("skip")}
          </a>
          <NextIntlClientProvider
            messages={{
              Common,
              Animation,
              Pwa,
              Errors,
              // demo:start
              Tasks,
              Mcp,
              // demo:end
            }}
          >
            <RoutingPreferenceProvider mode={mode}>
              <Toaster dismissLabel={pwa("toastClose")} regionLabel={pwa("toastRegion")} />
              <PwaProvider>
                <Providers>{children}</Providers>
              </PwaProvider>
            </RoutingPreferenceProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
