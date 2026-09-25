# Architecture

## Boundaries

- `@repo/web`: Next.js routing, React rendering, client providers, HTTP adapter, caching, and PWA integration.
- `@repo/contracts`: browser-safe ArkType schemas and oRPC contracts. No server implementations or secrets.
- `@repo/api`: server-only procedures, request context, business logic, and repository abstraction.
- `@repo/ui`: shared Base UI components, Tailwind design tokens, and `cn` re-export.

Dependencies are explicit and acyclic. Application packages consume internal source packages; shared packages do not import application code.

## Data flow

Browser clients call `/api/rpc`. Server Components invoke the same validated procedures in-process. Render initial data on the server and hydrate TanStack Query for interactive views. Server QueryClients are request-scoped; each browser has a stable QueryClient.

TanStack Query owns remote data, nuqs owns shareable URL state, Zustand owns shared local UI state, and React owns component-local state. Do not duplicate those responsibilities.

Server cache entries have explicit tags and lifetimes. Mutations invalidate relevant server entries and browser queries. Read request-specific information outside cached scopes and suspend dynamic rendering below the static shell.

## PWA boundary

Build the service worker after Next.js with Serwist configurator mode. Precache only approved static assets and the offline fallback. Never cache RPC, personalized HTML, or RSC responses in the worker. Ordinary development does not register a worker. Updates wait for user activation.
