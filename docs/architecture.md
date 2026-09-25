# Architecture

## Boundaries

| Package | Owns |
| --- | --- |
| `@repo/web` | Next.js routes, rendering, providers, HTTP adapter, framework caching, and PWA. |
| `@repo/contracts` | Browser-safe ArkType input/output schemas, oRPC contracts, and client types. |
| `@repo/api` | Server-only procedures, request context, and repository abstraction. |
| `@repo/ui` | Shared Base UI components, Tailwind tokens, Motion/Morphicons wrappers, and the `cn` re-export. |
| `@repo/temporal` | Browser-safe standard Temporal API with native selection and polyfill fallback. |

Next.js transpiles the private source packages directly. Dependencies are explicit and acyclic: shared packages do not import application code, and browser modules never import `@repo/api`.

## Data flow

Define ArkType schemas and `oc` contracts first, then implement them with `implement(contract).router(...)`. The same runtime-validated procedures serve the browser through `/api/rpc` and Server Components through `createApiClient(context)` without an internal HTTP round trip. RPC responses send `Cache-Control: no-store`.

The workbench parses URL state on the server, fetches its initial query, and passes dehydrated state to TanStack Query. `React.cache` scopes the server QueryClient to a render request; the browser uses a stable client. A 60-second stale time avoids an immediate duplicate fetch. Successful mutations invalidate the task query family.

State ownership:

- TanStack Query: remote tasks and mutation status.
- nuqs: the `status` URL filter, including browser history; unknown values default to `all`.
- Zustand: compact view, created once per provider with deterministic defaults and no persistence.
- React: form drafts and component-local feedback.

## Replace or remove the demo

`TaskRepository` currently has synchronous `list`, `create`, and `setCompleted` methods. `createDemoRepository()` produces isolated state for tests. The running app uses a **public process-global** instance so page and Route Handler bundles share the same demonstration list. It survives development reloads but not process restarts, provides no authorization, and does not synchronize across servers.

For persistent data, inject an authorized repository into each request context in both the HTTP adapter and the server client. If the database adapter is asynchronous, change the repository signatures to promises and await writes before testing results or calling `onTasksChanged`. Never put request identity, credentials, or user-specific state in the demo global slot. Add authentication and authorization alongside the adapter; they are not supplied by this template.

To remove the example, replace the task contract/router/repository and the workbench section in the home page. Remove its search parser and compact-view store if unused. Update or remove the matching unit and browser scenarios rather than leaving tests coupled to demonstration labels.

## Cache ownership

Cache Components is enabled. The public stack overview demonstrates `use cache` with `cacheLife("hours")`. The task workbench runs after `connection()` beneath Suspense and is deliberately not stored in the Next.js data cache. Its in-memory data must not become a build-time snapshot.

The API context exposes optional `onTasksChanged: () => void | Promise<void>`, awaited after successful writes. It is unused by the uncached demo. When adding tagged server caching, provide invalidation through this callback and retain client query invalidation. Read request-specific information outside cached scopes.

Inside an oRPC Route Handler, use `revalidateTag(tag, "max")` for stale-while-revalidate, or `revalidateTag(tag, { expire: 0 })` when the next read must be fresh. `updateTag` is available only in Server Actions, not Route Handlers. Choose user-scoped cache keys/tags if caching authorized data. Consult the installed Next.js guides when changing this behavior.

## PWA boundary

Serwist configurator mode builds the worker after Next.js. The precache includes compiled static assets, icons, and the static `/offline` page. Other HTML navigations use the network and fall back offline only when the network strategy fails. RPC, RSC, and non-GET requests bypass worker handling; successful personalized HTML is never added to its cache. There is no offline data store or queued-write support.

Worker registration is production-only. Installation requires a supported browser and HTTPS, with localhost usable for testing. Updates wait for the user's **Reload to update** click. Navigation caching and automatic reload on reconnect are disabled. Replace the manifest name/colors and 192px, 512px, and maskable icons for each new project.
