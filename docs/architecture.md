# Architecture

## Boundaries

| Package | Owns |
| --- | --- |
| `@repo/web` | Next.js routes, rendering, providers, RPC/REST/MCP adapters, OpenAPI/Scalar configuration, development MCP Inspector wrapper, framework caching, and PWA. |
| `@repo/contracts` | Browser-safe ArkType input/output schemas, oRPC contracts, OpenAPI route metadata, and client types. |
| `@repo/api` | Server-only procedures, request context, and data access, such as repositories. |
| `@repo/ui` | Shared Base UI components, Tailwind tokens, Motion/Morphicons wrappers, and the `cn` re-export. |
| `@repo/temporal` | Browser-safe standard Temporal API with native selection and polyfill fallback. |
| `@repo/i18n` | Browser-safe locale policy, typed English/Spanish catalogs, and website/PWA catalog boundaries. |

Next.js transpiles the private source packages directly. Dependencies are explicit and acyclic: shared packages do not import application code, and browser modules never import `@repo/api`.

## Data flow

Define ArkType schemas and `oc` contracts first, then implement them with `implement(contract).router(...)`. The same runtime-validated procedures serve the browser through `/api/rpc`, REST clients through the paths in the contract (for example `/api/v1/...`), and Server Components through `createApiClient(context)` without an internal HTTP round trip. The more-specific RPC Route Handler remains separate from the REST catch-all. `GET /api/health` is a separate, uncached Route Handler for container and load-balancer liveness checks; it is not part of the contract, so it has no OpenAPI operation or MCP tool.

`OpenAPIReferencePlugin` generates `/api/openapi.json` and the public Scalar reference at `/api/docs` from the implemented contract. The renderer uses a pinned CDN asset; schemas and API calls stay on the application origin. RPC, REST, specification, and documentation responses send `Cache-Control: no-store`. See [OpenAPI](openapi.md) for schema conversion, endpoint metadata, and the REST path-ID guard.

The stateless Streamable HTTP MCP endpoint at `/api/mcp` derives its tools from that same in-memory specification. It dispatches generated requests directly through the REST adapter with request-scoped context, preserving contract validation and mutation callbacks without a network round trip. Only immutable tool metadata can be reused between requests; MCP server/transport instances and request context remain isolated. The endpoint is enabled publicly by default, can be disabled with `MCP_ENABLED=false`, and sends `no-store`. A development-only Inspector wrapper embeds the authenticated local Inspector started by `pnpm dev`; it returns 404 in production. See [MCP](mcp.md) for origin rules and local client setup.

`apps/web/src/components/providers.tsx` wires TanStack Query and nuqs. `React.cache` scopes the server QueryClient to a render request; the browser uses a stable client. A 60-second stale time avoids an immediate duplicate fetch after hydration.

Keep context values above a streamed Suspense boundary the same after hydration. React can reveal streamed content up to 300 ms after it arrives, so the page may hydrate first. If a provider above the hidden boundary then changes its value, React renders the boundary again on the client and drops its server HTML. For this reason the language controls read their hydration flag themselves, and the Motion provider wraps each animated section instead of the whole application.

<!-- demo:start -->
The workbench parses URL state on the server, fetches its initial query, and passes dehydrated state to TanStack Query. Successful mutations invalidate the task query family.

The task workbench and JSON MCP explorer live at `/playground#tasks` and `/playground#mcp`. The homepage retains the stack/architecture introduction and Motion/Morphicons previews; shared header/footer components connect both pages. Playground search parameters are passed beneath Suspense to the existing server workbench, preserving request-scoped prefetching and hydration.
<!-- demo:end -->

Page files live beneath `app/[routingMode]/[locale]`. Explicit language URLs are the default; the **Language in URL** switch in the header demonstrates unprefixed URLs for a visitor. Consumers can turn off the switch (`demoEnabled: false`) and fix either policy in `routingSettings`. The proxy composes next-intl negotiation with internal mode rewrites. Validated root parameters select the prerendered document language and navigation mode without document-level Suspense or request APIs. The static offline route is isolated in `app/(standalone)`. API protocols and user data keep their original content. See [localization](i18n.md).

<!-- demo:start -->
The JSON MCP explorer uses TanStack Query for on-demand discovery and tool execution, with a tab-local Zustand store for editable JSON drafts and tool selection. Same-origin Server Actions create request-scoped official SDK clients and dispatch real protocol messages to the shared MCP endpoint in process. The HTTP SDK transport stays on the server. Both this bridge and the public route share `lib/mcp-endpoint.ts` for request context; the actions enforce their own Host/Origin comparison and MCP runtime enablement without changing the public endpoint's origin policy. See [the playground guide](mcp.md#website-playground).

The separate MCP App is a self-contained React HTML resource at `ui://prelude/tasks.html`, read through `/api/mcp` and associated with the generated `listTasks` operation. Its input/output contracts and JSON responses are unchanged. A compatible host renders it in a sandbox; the official App SDK proxies its tool calls through that host's existing connection. The widget uses shared UI components/tokens and an isolated TanStack Query client. It does not mount Next.js providers, import server implementations, or make direct HTTP API calls. `/playground#mcp-app` supplies connection guidance and a development Inspector link, not an AppBridge host. See [MCP Apps](mcp-apps.md) for CSP, builds, and resource handling.
<!-- demo:end -->

State ownership:

- TanStack Query: remote data and mutation status.
- nuqs: state that belongs in the URL, such as filters, including browser history.
- Zustand: tab-local client state, such as drafts. Create stores per request on the server with deterministic defaults.
- React: component-local presentation and focus references.

<!-- demo:start -->
In the demo, TanStack Query holds the tasks, and its mutation cache retains MCP execution data, errors, and pending status across locale route trees. nuqs holds the `status` filter; unknown values default to `all`. Zustand holds workbench density, drafts, edits, validation codes, and synchronous request guards, plus MCP tool selection, argument drafts, and validation. Its draft stores use no browser storage or cross-tab state and reset on a full document reload.
<!-- demo:end -->

## Data access and persistence

<!-- demo:start -->
`TaskRepository` currently has synchronous `list`, `create`, `updateTitle`, `setCompleted`, and `delete` methods. `updateTitle` changes only the normalized title and preserves the task's ID and completion; missing IDs return `undefined`, which the procedure translates to `NOT_FOUND`. `createDemoRepository()` produces isolated state for tests. The running app uses a **public process-global** instance so page and Route Handler bundles share the same demonstration list. It survives development reloads but not process restarts, provides no authorization, and does not synchronize across servers. Each demo repository keeps at most 100 tasks; creating another evicts the oldest so public writes cannot grow memory without bound. Never put request identity, credentials, or user-specific state in that global slot.

<!-- demo:end -->
Every transport receives the same request context: `Context` in `packages/api/src/router.ts` declares it, and `createRequestContext()` in `apps/web/src/lib/request-context.ts` builds it for **the RPC, REST, and MCP adapters and the direct server client**. For persistent data, add an authorized repository or database client there. If the database adapter is asynchronous, make the repository methods return promises and await writes before returning results or calling a cache invalidation callback. Add authentication and authorization alongside the adapters; they are not supplied by this template. Protect the procedures consistently across transports, and decide which contracts belong in public documentation and tool discovery.

<!-- demo:start -->
## Remove the demo

Run `pnpm remove-demo` to remove the task demo in one step and keep the infrastructure. See [Remove the demo](remove-demo.md) for what it deletes and what you get.

Demo code is kept apart so it can be removed in one step. Task unit tests live in `*.tasks.test.ts` files, and demo browser scenarios live in `tests/demo/`, `tests/e2e/demo/`, `tests/dev/demo/`, and `tests/stack/demo/`. The other tests cover the infrastructure only, so they keep passing without the demo. Inside shared files, each demo-only block sits between `demo:start` and `demo:end` comments (`// demo:start` in code, `{/* demo:start */}` in JSX, `# demo:start` in YAML, `<!-- demo:start -->` in Markdown). Deleting a whole block, markers included, leaves code that still compiles. When you add demo-only code, mark it the same way and list the file in `scripts/remove-demo.mjs`.

<!-- demo:end -->
## Cache ownership

Cache Components is enabled. The public stack overview demonstrates `use cache` with `cacheLife("hours")`. Data that changes at run time, such as an in-memory or per-request list, must render after `connection()` beneath Suspense so it does not become a build-time snapshot.

Validated locale and routing-mode root parameters separate cached page content. Cookies and request headers stay outside cached rendering. Explicit language URLs retain Next.js cache behavior and language alternate links, while negotiated redirects and preference-dependent unprefixed responses remain `private, no-store`. Hidden-URL overrides from the **Language in URL** switch (`demoEnabled`) are `noindex`. The localized manifest is private and varies on cookie/language headers. The offline page bundles its own catalogs. Changing language or routing mode preserves browser query clients, drafts, and the PWA activation controller.

When adding tagged server caching, add an invalidation callback to the API context, await it after successful writes, provide it in every context factory, and keep client query invalidation. Read request-specific information outside cached scopes.

<!-- demo:start -->
The task workbench runs after `connection()` and is deliberately not stored in the Next.js data cache. The demo context exposes optional `onTasksChanged: () => void | Promise<void>`, awaited after successful writes through every transport or the direct client; it is unused by the uncached demo. Scalar and external MCP mutations do not notify an already-open workbench; reload or refetch it to see changes. The JSON explorer explicitly invalidates its playground page's task queries after successful calls. Each MCP App refreshes its own selected filter after a mutation; other widgets/pages remain independent.

The generated widget HTML is a build artifact, not cached task data. Production lazily memoizes successful HTML reads; development reads the latest asset. Its configuration uses the resolved tool names after generator renames/exclusions. Turbo caches the HTML alongside Next.js and Serwist output; explicit Next.js tracing includes it in the standalone runtime. Resource responses still use the MCP endpoint's `no-store` policy.
<!-- demo:end -->

The generated MCP tool catalog is immutable and reused between requests; MCP responses use `no-store`.

Inside an oRPC Route Handler, use `revalidateTag(tag, "max")` for stale-while-revalidate, or `revalidateTag(tag, { expire: 0 })` when the next read must be fresh. `updateTag` is available only in Server Actions, not Route Handlers. Choose user-scoped cache keys/tags if caching authorized data. Consult the installed Next.js guides when changing this behavior.

## PWA boundary

Serwist configurator mode builds the worker after Next.js. The precache includes compiled static assets, icons, and the static `/offline` page. Other HTML navigations use the network and fall back offline only when the network strategy fails. All `/api/` paths (including RPC, REST, MCP, Inspector, docs, and the specification), external URLs (including Scalar's CDN), RSC, and non-GET requests bypass worker handling; successful personalized HTML is never added to its cache. There is no offline documentation, data store, or queued-write support.

Worker registration is production-only. Installation requires a supported browser and HTTPS, with localhost usable for testing. The browser controls its normal update-check timing; the app does not poll or schedule additional checks. First installation stays quiet. Navigation caching and automatic reload on reconnect are disabled. Set the name and browser colors in `apps/web/src/site.ts`, and replace the icons and `favicon.ico` for each new project, keeping the file names and sizes listed in the README's branding step.

The manifest localizes description/language while keeping one app ID and start URL. `/offline` remains a single static English document under `app/(standalone)` for precaching and no-JavaScript use; its client selects the saved/browser language from bundled PWA messages after hydration. Update toasts translate in place without changing approval or dismissal state. See [localization](i18n.md#pwa-and-offline-behavior).

Browsers download and precache discovered replacements before asking for activation. There is no artificial activation delay after approval, although installation and control changes still follow the browser lifecycle. Once every old client closes, the browser can activate its waiting replacement normally without an in-app approval. Standalone Scalar pages do not mount the app's notification UI.

An accessible, responsive toast at the top right announces a waiting worker. It uses the existing Base UI dependency through the shared UI package, with no additional toast library. **Update now** requests immediate worker activation and reloads only the approving tab once the replacement takes control. The disabled **Updating…** action prevents duplicate requests. Other open tabs receive **Update ready** with a separate **Reload now** action, preserving their drafts until each tab approves reloading.

The close control or an upward/rightward swipe dismisses the notification for that worker for the lifetime of the current document, including locale changes and a back/forward-cache pause; a newer waiting worker can be offered again. Dismissing a waiting toast does not activate its worker. Dismissing during **Updating…** keeps the approval and pending reload, while suppressing further error messages and reminders for that worker. If an undismissed activation does not complete within 15 seconds, **Couldn’t update** offers **Try again**, retaining the application and its drafts rather than forcing a reload.

For other client notifications, import `toast` from `@repo/ui/components/toast` and call `toast.add({ title, description })` in an event handler or effect. Keep one `Toaster` declaration in the locale root layout; do not add another provider per page. Next.js can retain a previous locale layout's hidden toast DOM through Activity, while the active layout presents notifications. Notifications expire after five seconds by default; use `timeout: 0` for persistent actions and a stable `id` to update one notification in place. `toast.update(id, options)` and `toast.close(id)` are available for custom flows.

## Errors, logs, and configuration

`apps/web/src/lib/server-log.ts` writes one JSON line per server error to stderr, with the level, time, message, error name/message/stack, and context fields. It follows the error's `cause`; for validation errors it keeps each issue's message and path but never the invalid value. Container runtimes and log drains collect it without extra setup. The RPC and REST handlers log procedure errors that become 5xx responses, including invalid procedure output, and other 5xx responses with the method and path, such as a failure to generate the OpenAPI document; expected 4xx errors stay quiet. Responses never include the cause. MCP tools dispatch through the REST handler, so a failing tool is logged once.

`apps/web/src/instrumentation.ts` runs when the server starts. Its `register()` validates the runtime environment, and `onRequestError()` logs rendering, Route Handler, and Server Action failures with the error digest, method, path (without the query string), and route. Next.js prints the stack for these errors itself, so this line leaves it out. Connect Sentry, OpenTelemetry, or another reporting service in this file.

`apps/web/src/env.ts` parses every runtime variable the server reads (`MCP_ENABLED`, `MCP_ALLOWED_ORIGINS`, and the development-only `MCP_INSPECTOR_PORT`). An invalid value stops startup with one error that names each variable and its allowed form. Callers parse it again per request, so values apply without a rebuild. A page must read it after `await connection()` (see [cache ownership](#cache-ownership)), or the build keeps the value. Add new server variables there, to the expected objects in `apps/web/src/env.test.ts`, and to both `.env.example` files. Docker passes only the variables it lists, so also add each one to the `environment:` maps in `compose.yaml` and `compose.dev.yaml`. Turbo does the same for builds: a value needed at build time also goes in `tasks.build.env` in `turbo.json`.

`app/[routingMode]/[locale]/error.tsx` handles errors below the localized root layout, and `app/global-error.tsx` replaces a root layout that failed. Both show the error digest as a reference code that matches the server log entry, never the error message, and their **Try again** button calls `retry()`, which fetches the failed segment from the server again.

## Security headers

`apps/web/next.config.ts` sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that turns off camera, microphone, and geolocation on every response. `X-Powered-By` is disabled.

Pages also receive a Content Security Policy that allows only same-origin scripts, styles, fonts, connections, and images (plus `data:` and `blob:` images), and blocks framing, plugins, and cross-origin form posts. Prerendered pages cannot carry per-request nonces, so inline scripts and styles stay allowed; development adds `'unsafe-eval'` for React's error stacks. A nonce-based policy would require dynamic rendering for every page; see the installed Next.js Content Security Policy guide. `/api/` responses keep the shared headers but not this policy. The Scalar reference at `/api/docs` is sent without a Content Security Policy so it can load its pinned CDN renderer, which carries an integrity hash; the development Inspector page sets its own policy, which frames its local origin.

When a page needs another host's scripts, images, or API, add that origin to the matching directive. The production browser suite checks the headers and fails on policy violations in the browser flows.

The app does not send `Strict-Transport-Security`. It cannot tell whether visitors reach it over HTTPS, and on `https://localhost` the header would force HTTPS for other local projects too. Send it from the HTTPS proxy; see [deploying on a server](docker.md#deploying-on-a-server).
