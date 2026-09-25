import { WifiOffIcon } from "lucide-react";

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center px-8 py-16"
    >
      <div className="mb-8 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <WifiOffIcon className="size-6" aria-hidden="true" />
      </div>
      <p className="mb-3 font-mono text-xs text-muted-foreground">NEXT / TEMPLATE</p>
      <h1 className="text-4xl font-medium tracking-tight">You’re offline.</h1>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground">
        This page needs a connection. Your demo tasks aren’t saved offline. Reconnect, then try
        again.
      </p>
      <a
        href="/"
        className="mt-8 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Try again
      </a>
    </main>
  );
}
