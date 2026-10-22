import "@repo/ui/styles/globals.css";
import { defaultLocale } from "@repo/i18n";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";

// This root never reads request state: /offline must remain a precacheable document.
export default function StandaloneLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets data-theme on <html> before hydration.
    <html lang={defaultLocale} suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
