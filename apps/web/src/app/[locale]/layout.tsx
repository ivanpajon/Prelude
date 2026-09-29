import "@repo/ui/styles/globals.css";
import { locales } from "@repo/i18n";
import { Toaster } from "@repo/ui/components/toast";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { PwaProvider } from "@/components/pwa-provider";

export const metadata: Metadata = {
  title: "Prelude — Less setup. More building.",
  description:
    "A considered foundation for your next project. React, Next.js, and a connected, type-safe application stack.",
  applicationName: "Prelude",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Prelude" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#20382a" };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("Common");
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          {t("skip")}
        </a>
        <NextIntlClientProvider>
          <Toaster />
          <PwaProvider>
            <Providers>{children}</Providers>
          </PwaProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
