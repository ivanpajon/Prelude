import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16"
    >
      <p className="font-mono text-xs text-muted-foreground">404 / PAGE NOT FOUND</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">A fresh direction.</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        There’s nothing at this address. Your workspace is a good place to start.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to the workspace
      </Link>
    </main>
  );
}
