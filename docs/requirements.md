# Requirements

## Version policy

Use compatible stable releases, with React 19.x, Next.js 16.x, and Tailwind 4.x. Direct dependencies are pinned and one pnpm lockfile is committed. The exact versions are in each `package.json`; this page names only the major lines, so it stays true after updates. Node 26 (the version in `.node-version`) and pnpm 12 (the version in `packageManager`) are the runtime/tooling baseline. Node types track 26.x. Upgrades must pass `pnpm verify` and a frozen-lockfile installation.

TypeScript stays on 6.0.x; compiler upgrades are separate from linting changes. All oRPC packages share one stable 1.x version; follow the [v1 documentation](https://v1.orpc.dev/docs/getting-started), rather than mixing newer prerelease APIs into this implementation.

### Dependency updates

`renovate.json` configures [Renovate](https://docs.renovatebot.com/). Install the free [Renovate GitHub App](https://github.com/apps/renovate) on your repository to enable it. Every Monday it opens one pull request for non-major npm updates, with separate groups for Next.js and React, oRPC, the MCP SDK, Serwist, Vitest, and Biome. Biome has its own group because a Biome patch release can change a nursery lint rule, and a lint failure there should not hold back the other updates. Each major update gets its own pull request. Renovate waits 3 days after a release before it proposes it. Until then, the Dependency Dashboard lists the update under **Pending Status Checks**; this is normal, and the pull request opens on the next Monday after the wait. After Renovate's first run, tick **Create all awaiting schedule PRs at once** on the Dependency Dashboard to open the starting backlog now. Security fixes are labeled `security`, skip the wait, and are not held for the schedule. Renovate treats an update as a security fix only after the advisory reaches the GitHub Advisory Database or OSV, which can take days; when Next.js or React announce a security release, tick that update's box on the Dependency Dashboard or update by hand.

It keeps exact versions, the SHA pins in `.github/workflows`, and the Dockerfile image digests, including the `syntax` line's frontend image. It also keeps TypeScript on 6.0.x and Node on 26.x. The Node pull request updates `@types/node` and both Dockerfile images together. It updates `.node-version` only once a Node line is LTS: Node 26 becomes LTS on 2026-10-28, so until then CI can test an older Node patch release than the images use. The Node range in `engines` stays as it is, because it still allows the new version. The pnpm pull request updates `packageManager`, `engines.pnpm`, and the Dockerfile's pnpm version together. Renovate also updates the Scalar renderer URL in `apps/web/src/lib/api-info.ts` and the schema URL in `biome.json`. Its Scalar pull request also needs the `scalarScriptIntegrity` hash next to that URL updated by hand; see [Scalar renderer and caching](openapi.md#scalar-renderer-and-caching). Update the Docker Compose release that CI installs by hand, with its checksum. Once a month it refreshes the lockfile so indirect dependencies pick up patched releases.

Almost every Renovate pull request changes a `package.json` or the lockfile, so it runs both CI workflows, and its merge runs both again. In a private repository, each of those runs costs about 46 billed minutes with the demo and about 31 without it; see [continuous integration](verification.md#continuous-integration) for ways to use fewer.

If CI stops at install with `ERR_PNPM_IGNORED_BUILDS`, an update added a package with an install script. On that branch, run `pnpm approve-builds`. Because `pnpm-workspace.yaml` has a `permissions` block, pnpm writes the decision there, as `build: true` or `build: false` under the package name. You can also add the package to `allowBuilds` with `true` or `false`; pnpm reads both. Add a one-line comment saying why, and commit the change. The `permissions` block also turns off the agent skills that the MCP Inspector ships, so an install under a coding agent such as Claude Code does not ask to approve them.

Renovate is used instead of Dependabot because Dependabot cannot yet read pnpm 12 lockfiles. Either way, the CI **Audit** job checks production dependencies for known advisories on every run and once a week. See [continuous integration](verification.md#continuous-integration) for what to do when it fails.

`pnpm-workspace.yaml` overrides the `browserslist` version that `@serwist/next` 9.5.12 pins, because that version has known advisories. Newer Serwist releases do not need it. In the Serwist update pull request, delete the override and this paragraph, and run `pnpm install` to refresh the lockfile.

## Stack

- React 19, Next.js 16 App Router, Turbopack development/production builds, and Cache Components with Partial Prefetching.
- shadcn with Base UI, Tailwind 4 CSS-first tokens, and `cn` for class composition.
- Contract-first oRPC 1.x with ArkType inputs, outputs, and inferred TypeScript types.
- Public REST access through the same procedures, automatic OpenAPI 3.1.1 at `/api/openapi.json`, and Scalar at `/api/docs`. Scalar's standalone renderer loads from jsDelivr at the pinned URL in `apps/web/src/lib/api-info.ts`; it is not an installed application dependency.
- Native stateless Streamable HTTP MCP at `/api/mcp`, generated from OpenAPI using `mcp-from-openapi` and the MCP SDK server and client. Every API operation becomes a tool by default; `MCP_ENABLED=false` disables the endpoint.
- MCP Inspector as a root development tool, managed by `pnpm dev` and embedded at the development-only `/api/mcp/inspector` route. Inspector authentication remains enabled; no agent configuration is installed automatically.
<!-- demo:start -->
- A dedicated `/playground` with the task workbench, URL filters, local density state, and JSON MCP explorer. Discovery is on demand, arguments are editable, schemas are generated, and calls execute against the real endpoint. Same-origin Server Actions use a request-scoped SDK client in process; `MCP_ENABLED=false` disables these actions too. Successful calls refresh the workbench. The homepage retains Motion and Morphicons previews.
- A removable task MCP App using the official `ext-apps` package with the MCP SDK. The `listTasks` tool references a self-contained HTML resource; the widget uses the shared list/create/edit/complete/delete tool schemas and JSON outputs. Preview uses the local Inspector, with browser-reachable sandbox port `6275` by default; there is no custom website MCP Apps host.
- Widget-only bundling with tsdown and Tailwind CLI. Its generated HTML is traced into standalone output and restored by Turbo. Next.js retains Turbopack and its Tailwind PostCSS setup; Biome remains the sole linter/formatter.
<!-- demo:end -->
- TanStack Query for client server data, nuqs for URL state, and Zustand for shared local UI state.
- next-intl with shared `@repo/i18n` catalogs. English and Spanish cover the website and PWA. Explicit language URLs are the default; a visitor-specific **Language in URL** switch in the header demonstrates unprefixed URLs. Consumers can turn off the switch (`demoEnabled: false`) and select either fixed policy. Both policies prerender localized documents without document-level Suspense. Explicit prefixes win over preferences; unprefixed entries use saved/browser language with a fallback to the default locale (English in this template). API identifiers, schemas, descriptions, JSON outputs, stored content, and third-party interfaces retain their original language.
<!-- demo:start -->
- use-intl translates the standalone MCP App into English and Spanish.
<!-- demo:end -->
- Serwist for installability, static assets, an offline fallback, and user-controlled updates through a responsive, dismissible Base UI toast using the existing UI dependency.
- pnpm workspaces, Turborepo, and strict TypeScript.
- Biome as the sole linter, formatter, and import organizer.
- Husky pre-commit with lint-staged, preserving unstaged changes.
- Vitest for unit/integration checks and Playwright for production browser checks.
- Testing Library with jsdom for component tests, plus Vitest coverage and its local UI.
- Commitlint CLI and conventional configuration for commit-message checks.
- Standard Temporal API with a native-first, full-calendar polyfill fallback.
- Motion and Morphicons with shared reduced-motion defaults; Lucide icon data matches the React icon package.
- React Doctor for optional local React diagnostics and machine-readable reports; Biome remains the routine source linter.

## Acceptance

Reproducible installation; passing formatting, linting, type checking, tests, and production builds; compatible Base UI components; runtime API validation across RPC and REST; generated schemas and documented endpoint behavior; desktop/mobile Scalar navigation and requests using its pinned renderer; request isolation; production PWA fallback and updates; exclusion of API/docs responses from service-worker caches; restoration of generated artifacts, such as the service worker, from Turbo cache; and hooks that preserve partial staging.

<!-- demo:start -->
Demo acceptance also covers SSR hydration without an immediate duplicate fetch, mutation invalidation, navigable URL state, SSR-safe local state, and real development Inspector calls.
<!-- demo:end -->

PWA updates register only in production and use browser-default update checks. First installation is silent. A waiting worker offers **Update now**, supports keyboard use and dismissal per worker, and waits for approval while existing clients remain open. Activation reloads only the approving tab; other tabs retain their drafts and offer **Reload now** separately. Notifications fit narrow viewports, avoid duplicate activation/reloads, and offer retry after an activation failure or a 15-second timeout. A newer worker can show a notification after an earlier one was dismissed.

MCP acceptance includes automatic tool discovery, SDK protocol compatibility, correct request/response mapping, shared REST/RPC data, validation and request isolation, awaited invalidation, no-store responses, disabled-endpoint 404, production Inspector 404, and development Inspector discovery. Development access is restricted to loopback. Production accepts native clients without Origin; a supplied Origin must exactly match `MCP_ALLOWED_ORIGINS` or receive 403. These origin checks do not provide authentication or authorization.

<!-- demo:start -->
MCP App acceptance includes metadata/resource discovery, operation-ID association through renamed and excluded tools, native and legacy array output, initial rendering without duplicate fetches, host-mediated mutations and filter refresh, cancellation/error recovery, instance isolation, and restrictive CSP without external assets or direct network calls. Build checks cover a self-contained asset, development rebuilds, Turbo restoration, and standalone Docker packaging. The actual Inspector preview must work natively and through Compose's loopback-published sandbox. Its localization covers host-context changes without reconnecting or refetching initial data.
<!-- demo:end -->

Localization acceptance covers catalog parity and ICU counts; browser detection and validated overrides; both live URL policies, queries, hashes, and history; correct links and document language before hydration; translated errors retaining drafts and protocol results; deterministic prefixed responses versus private unprefixed responses; and PWA manifest/toasts and static offline fallback. Native and Docker builds must include bundled translations and preserve API/PWA exclusions. See [localization](i18n.md) for implementation boundaries.

## Development workflow

Biome owns linting, import organization, and formatting, with Tailwind CSS directive parsing enabled. Its opt-in `noTailwindArbitraryValue` rule rejects arbitrary values in application JSX/TSX. The rule has no options in `biome.json`: Biome checks class strings in `cn(...)` calls by default. Generated shared UI components retain their required arbitrary values. This is a nursery rule, so review its behavior when Biome is updated; Biome updates come in their own Renovate pull request.

<!-- demo:start -->
tsdown's internal Rolldown/Oxc compilation does not add a separate Oxc tool or lint workflow. Tailwind CLI's internal Lightning CSS processing applies only to the standalone widget stylesheet. The main application's Tailwind PostCSS configuration is unchanged.
<!-- demo:end -->

`@shadcn/lint` was removed to keep one linter: it requires an ESLint or Oxlint host and cannot run inside Biome. There is no equivalent configured check for unknown Tailwind utilities, raw palette colors, or dynamically constructed classes. Prefer semantic tokens and complete literal class names; these remaining conventions require code review. See the [plugin's supported hosts](https://github.com/shadcn-ui/lint) and [Biome's arbitrary-value rule](https://biomejs.dev/linter/rules/no-tailwind-arbitrary-value/).

Husky runs Biome safe fixes on staged files through lint-staged. Full checks, unit tests, production browser tests, and build-cache restoration are available separately and through `pnpm verify`. Delivery is organized into local commits for workspace, tooling/hooks, UI, API/state, PWA, and verification/documentation.

## Deferred

Authentication, production persistence/ORM, deployment provider, cross-origin API configuration, generated client SDKs, offline documentation/data reading/writing, and push notifications remain project decisions. Vitest and Playwright are the selected verification tools; GitHub Actions runs them and the Docker stack checks. Exposing REST does not add a database or backend platform requirement.

<!-- demo:start -->
The removable example uses an explicitly nonpersistent, public demo repository.
<!-- demo:end -->
