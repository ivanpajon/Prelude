# Architecture

## Boundaries

| Package | Owns |
| --- | --- |
| `@repo/web` | Next.js routes, rendering, providers, RPC/REST adapters, OpenAPI/Scalar configuration, framework caching, and PWA. |
| `@repo/contracts` | Browser-safe ArkType input/output schemas, oRPC contracts, OpenAPI route metadata, and client types. |
| `@repo/api` | Server-only procedures, request context, and repository abstraction. |
| `@repo/ui` | Shared Base UI components, Tailwind tokens, Motion/Morphicons wrappers, and the `cn` re-export. |
| `@repo/temporal` | Browser-safe standard Temporal API with native selection and polyfill fallback. |

Next.js transpiles the private source packages directly. Dependencies are explicit and acyclic: shared packages do not import application code, and browser modules never import `@repo/api`.

## Data flow

Define ArkType schemas and `oc` contracts first, then implement them with `implement(contract).router(...)`. The same runtime-validated procedures serve the browser through `/api/rpc`, REST clients through `/api/v1/tasks`, and Server Components through `createApiClient(context)` without an internal HTTP round trip. The more-specific RPC Route Handler remains separate from the REST catch-all.

`OpenAPIReferencePlugin` generates `/api/openapi.json` and the public Scalar reference at `/api/docs` from the implemented contract. The renderer uses a pinned CDN asset; schemas and API calls stay on the application origin. RPC, REST, specification, and documentation responses send `Cache-Control: no-store`. See [OpenAPI](openapi.md) for schema conversion, endpoint metadata, and the REST path-ID guard.

The workbench parses URL state on the server, fetches its initial query, and passes dehydrated state to TanStack Query. `React.cache` scopes the server QueryClient to a render request; the browser uses a stable client. A 60-second stale time avoids an immediate duplicate fetch. Successful mutations invalidate the task query family.

State ownership:

- TanStack Query: remote tasks and mutation status.
- nuqs: the `status` URL filter, including browser history; unknown values default to `all`.
- Zustand: compact view, created once per provider with deterministic defaults and no persistence.
- React: form drafts and component-local feedback.

## Replace or remove the demo

`TaskRepository` currently has synchronous `list`, `create`, and `setCompleted` methods. `createDemoRepository()` produces isolated state for tests. The running app uses a **public process-global** instance so page and Route Handler bundles share the same demonstration list. It survives development reloads but not process restarts, provides no authorization, and does not synchronize across servers.

For persistent data, inject an authorized repository into each request context in **both HTTP adapters (RPC and REST) and the direct server client**. If the database adapter is asynchronous, change the repository signatures to promises and await writes before testing results or calling `onTasksChanged`. Never put request identity, credentials, or user-specific state in the demo global slot. Add authentication and authorization alongside the adapters; they are not supplied by this template. Protect the procedures consistently across transports, and decide which contracts belong in the public documentation.

To remove the example, replace the task contract/router/repository and the workbench section in the home page. Remove its search parser and compact-view store if unused. Update the OpenAPI metadata and the task-specific PATCH body guard, or remove the REST/docs adapter and homepage link if they are unnecessary. Update or remove the matching unit and browser scenarios rather than leaving tests coupled to demonstration labels. See the [OpenAPI removal checklist](openapi.md#replace-or-remove-the-demo).

## Cache ownership

Cache Components is enabled. The public stack overview demonstrates `use cache` with `cacheLife("hours")`. The task workbench runs after `connection()` beneath Suspense and is deliberately not stored in the Next.js data cache. Its in-memory data must not become a build-time snapshot.

The API context exposes optional `onTasksChanged: () => void | Promise<void>`, awaited after successful writes through either transport or the direct client. It is unused by the uncached demo. When adding tagged server caching, provide invalidation in every context factory and retain client query invalidation. Scalar mutations do not notify an already-open workbench; reload or refetch it to see changes. Read request-specific information outside cached scopes.

Inside an oRPC Route Handler, use `revalidateTag(tag, "max")` for stale-while-revalidate, or `revalidateTag(tag, { expire: 0 })` when the next read must be fresh. `updateTag` is available only in Server Actions, not Route Handlers. Choose user-scoped cache keys/tags if caching authorized data. Consult the installed Next.js guides when changing this behavior.

## PWA boundary

Serwist configurator mode builds the worker after Next.js. The precache includes compiled static assets, icons, and the static `/offline` page. Other HTML navigations use the network and fall back offline only when the network strategy fails. All `/api/` paths (including RPC, REST, docs, and the specification), external URLs (including Scalar's CDN), RSC, and non-GET requests bypass worker handling; successful personalized HTML is never added to its cache. There is no offline documentation, data store, or queued-write support.

Worker registration is production-only. Installation requires a supported browser and HTTPS, with localhost usable for testing. The browser controls its normal update-check timing; the app does not poll or schedule additional checks. First installation stays quiet. Navigation caching and automatic reload on reconnect are disabled. Replace the manifest name/colors and 192px, 512px, and maskable icons for each new project.

Browsers download and precache discovered replacements before asking for activation. There is no artificial activation delay after approval, although installation and control changes still follow the browser lifecycle. Once every old client closes, the browser can activate its waiting replacement normally without an in-app approval. Standalone Scalar pages do not mount the app's notification UI.

An accessible, responsive toast at the top right announces a waiting worker. It uses the existing Base UI dependency through the shared UI package, with no additional toast library. **Update now** requests immediate worker activation and reloads only the approving tab once the replacement takes control. The disabled **Updating…** action prevents duplicate requests. Other open tabs receive **Update ready** with a separate **Reload now** action, preserving their drafts until each tab approves reloading.

The close control or an upward/rightward swipe dismisses the notification for that worker for the lifetime of the mounted application; a newer waiting worker can be offered again. Dismissing a waiting toast does not activate its worker. Dismissing during **Updating…** keeps the approval and pending reload, while suppressing further error messages and reminders for that worker. If an undismissed activation fails or does not complete within 15 seconds, **Couldn’t update** offers **Try again**, retaining the application and its drafts rather than forcing a reload.

For other client notifications, import `toast` from `@repo/ui/components/toast` and call `toast.add({ title, description })` in an event handler or effect. The application layout mounts the single `Toaster`; do not add another provider per page. Notifications expire after five seconds by default; use `timeout: 0` for persistent actions and a stable `id` to update one notification in place. `toast.update(id, options)` and `toast.close(id)` are available for custom flows.
