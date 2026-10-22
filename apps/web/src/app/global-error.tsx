"use client";

import "@repo/ui/styles/globals.css";
import { Button } from "@repo/ui/components/button";
import { useEffect, useRef } from "react";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * Replaces a root layout that failed to render, so no translation provider is available.
 * Its short copy is shown in both supported languages; extend it when adding a locale.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Announce the error page: keyboard focus would otherwise fall to the page body.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    // next-themes sets data-theme on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <title>Something went wrong · Algo salió mal</title>
        <ThemeProvider>
          <main
            id="main-content"
            className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16"
          >
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-4xl font-medium tracking-tight outline-none"
            >
              Something went wrong.
            </h1>
            <p lang="es" className="mt-2 text-2xl font-medium tracking-tight text-muted-foreground">
              Algo salió mal.
            </p>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Please try again in a moment.{" "}
              <span lang="es">Vuelve a intentarlo en un momento.</span>
            </p>
            {error.digest ? (
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                Reference · <span lang="es">Referencia</span>: {error.digest}
              </p>
            ) : null}
            <Button className="mt-8" onClick={() => retry()}>
              Try again · <span lang="es">Reintentar</span>
            </Button>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
