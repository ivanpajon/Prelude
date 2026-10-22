"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// The server copy of the theme script runs before paint. React 19 logs an error when a root layout
// re-renders (a locale change) and creates the script again on the client, so that copy is a data block.
const scriptProps = typeof window === "undefined" ? {} : { type: "application/json" };

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
