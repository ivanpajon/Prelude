"use client";

import { Button } from "@repo/ui/components/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16"
    >
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        A small interruption
      </p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">Let’s try that again.</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        We couldn’t load this page. Give it another try to get back to your workspace.
      </p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
