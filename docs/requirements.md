# Requirements

## Version policy

Use compatible stable releases, with React 19.x, Next.js 16.x, and Tailwind 4.x. Direct dependencies are pinned and one pnpm lockfile is committed. Node 26.10.0+ within 26.x and pnpm 12.6.0 are the runtime/tooling baseline. Node types track 26.x. Upgrades must pass `pnpm verify` and a frozen-lockfile installation.

TypeScript remains pinned to the verified 6.0.3 baseline; compiler upgrades are separate from linting changes. oRPC packages share stable version 1.15.4; follow the [v1 documentation](https://v1.orpc.dev/docs/getting-started), rather than mixing newer prerelease APIs into this implementation.

## Stack

- React 19.3.0, Next.js 16.3.6 App Router, Turbopack development/production builds, and Cache Components.
- shadcn 4.21.0 with Base UI 1.8.0, Tailwind 4.3.3 CSS-first tokens, and `cn` 0.4.0 for class composition.
- Contract-first oRPC 1.15.4 with ArkType 2.2.5 inputs, outputs, and inferred TypeScript types.
- Public REST access through the same procedures, automatic OpenAPI 3.1.1 at `/api/openapi.json`, and Scalar at `/api/docs`. Scalar's standalone renderer is pinned to 1.72.1 on jsDelivr; it is not an installed application dependency.
- Native stateless Streamable HTTP MCP at `/api/mcp`, generated from OpenAPI using `mcp-from-openapi` 2.8.0 and MCP SDK server/client 2.2.0. The public demo exposes its list/create/edit/complete/delete operations by default; `MCP_ENABLED=false` disables the endpoint.
- MCP Inspector 2.8.0 as a root development tool, managed by `pnpm dev` and embedded at the development-only `/api/mcp/inspector` route. Inspector authentication remains enabled; no agent configuration is installed automatically.
- A dedicated `/playground` with the task workbench, URL filters, local density state, and JSON MCP explorer. Discovery is on demand, arguments are editable, schemas are generated, and calls execute against the real endpoint. Same-origin Server Actions use a request-scoped SDK client in process; `MCP_ENABLED=false` disables these actions too. Successful calls refresh the workbench. The homepage retains Motion and Morphicons previews.
- A removable task MCP App using official `ext-apps` 2.0.3 with SDK 2.2.0. The `listTasks` tool references a self-contained HTML resource; the widget uses the shared list/create/edit/complete/delete tool schemas and JSON outputs. Preview uses the local Inspector, with browser-reachable sandbox port `6275` by default; there is no custom website MCP Apps host.
- Widget-only bundling with tsdown 0.23.0 and Tailwind CLI 4.3.3. Its generated HTML is traced into standalone output and restored by Turbo. Next.js retains Turbopack and its Tailwind PostCSS setup; Biome remains the sole linter/formatter.
- TanStack Query 5.103.2 for client server data, nuqs 2.10.1 for URL state, and Zustand 5.0.15 for shared local UI state.
- Serwist 9.5.12 for installability, static assets, an offline fallback, and user-controlled updates through a responsive, dismissible Base UI toast using the existing UI dependency.
- pnpm workspaces, Turborepo, and strict TypeScript.
- Biome as the sole linter, formatter, and import organizer.
- Husky pre-commit with lint-staged, preserving unstaged changes.
- Vitest for unit/integration checks and Playwright for production browser checks.
- Testing Library with jsdom for component tests, plus Vitest coverage and its local UI.
- Commitlint CLI and conventional configuration for commit-message checks.
- Standard Temporal API with a native-first, full-calendar polyfill fallback.
- Motion 13.4.4 and Morphicons 1.7.1 with shared reduced-motion defaults; Lucide 1.48.0 icon data matches the React icon package.
- React Doctor 0.9.14 for optional local React diagnostics and machine-readable reports; Biome remains the routine source linter.

## Acceptance

Reproducible installation; passing formatting, linting, type checking, tests, and production builds; compatible Base UI components; runtime API validation across RPC and REST; generated schemas and documented endpoint behavior; desktop/mobile Scalar navigation and requests using its pinned renderer; SSR hydration without an immediate duplicate fetch; request isolation; mutation invalidation; navigable URL state; SSR-safe local state; production PWA fallback and updates; exclusion of API/docs responses from service-worker caches; restoration of service-worker and MCP App artifacts from Turbo cache; and hooks that preserve partial staging.

PWA updates register only in production and use browser-default update checks. First installation is silent. A waiting worker offers **Update now**, supports keyboard use and dismissal per worker, and waits for approval while existing clients remain open. Activation reloads only the approving tab; other tabs retain their drafts and offer **Reload now** separately. Notifications fit narrow viewports, avoid duplicate activation/reloads, and offer retry after an activation failure or a 15-second timeout. A newer worker can show a notification after an earlier one was dismissed.

MCP acceptance includes automatic tool discovery, SDK protocol compatibility, correct request/response mapping, shared REST/RPC data, validation and request isolation, awaited invalidation, no-store responses, disabled-endpoint 404, production Inspector 404, and real development Inspector calls. Development access is restricted to loopback. Production accepts native clients without Origin; a supplied Origin must exactly match `MCP_ALLOWED_ORIGINS` or receive 403. These origin checks do not provide authentication or authorization.

MCP App acceptance includes metadata/resource discovery, operation-ID association through renamed and excluded tools, native and legacy array output, initial rendering without duplicate fetches, host-mediated mutations and filter refresh, cancellation/error recovery, instance isolation, and restrictive CSP without external assets or direct network calls. Build checks cover a self-contained asset, development rebuilds, Turbo restoration, and standalone Docker packaging. The actual Inspector preview must work natively and through Compose's loopback-published sandbox.

## Development workflow

Biome owns linting, import organization, and formatting, with Tailwind CSS directive parsing enabled. Its opt-in `noTailwindArbitraryValue` rule rejects arbitrary values in application JSX/TSX, including `cn(...)`; generated shared UI components retain their required arbitrary values. This is a nursery rule in the pinned Biome release, so review its behavior during upgrades.

tsdown's internal Rolldown/Oxc compilation does not add a separate Oxc tool or lint workflow. Tailwind CLI's internal Lightning CSS processing applies only to the standalone widget stylesheet. The main application's Tailwind PostCSS configuration is unchanged.

`@shadcn/lint` was removed to keep one linter: it requires an ESLint or Oxlint host and cannot run inside Biome. There is no equivalent configured check for unknown Tailwind utilities, raw palette colors, or dynamically constructed classes. Prefer semantic tokens and complete literal class names; these remaining conventions require code review. See the [plugin's supported hosts](https://github.com/shadcn-ui/lint) and [Biome's arbitrary-value rule](https://biomejs.dev/linter/rules/no-tailwind-arbitrary-value/).

Husky runs Biome safe fixes on staged files through lint-staged. Full checks, unit tests, production browser tests, and build-cache restoration are available separately and through `pnpm verify`. Delivery is organized into local commits for workspace, tooling/hooks, UI, API/state, PWA, and verification/documentation.

## Deferred

Authentication, production persistence/ORM, deployment provider, CI provider, cross-origin API configuration, generated client SDKs, offline documentation/data reading/writing, and push notifications remain project decisions. Vitest and Playwright are the selected verification tools. The removable example uses an explicitly nonpersistent, public demo repository; exposing REST does not add a database or backend platform requirement.
