export default function Loading() {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-7xl space-y-8 px-6 py-24 sm:px-10 lg:px-16"
      aria-busy="true"
    >
      <p role="status" className="text-sm text-muted-foreground">
        Getting your workspace ready…
      </p>
      <div className="h-16 max-w-xl animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      <div className="h-8 max-w-md animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
    </main>
  );
}
