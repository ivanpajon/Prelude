# Verification

## Interactive locale routing

Verified on 2026-09-30 with Node 26.10.0 and pnpm 12.6.0:

- Frozen installation, Biome, strict TypeScript, and all 404 unit/component/script tests with coverage passed.
- All 10 native development scenarios passed, including real Inspector/MCP App workflows and routing transitions that preserve task and MCP drafts.
- Production browser coverage passed across desktop, mobile, and PWA. The initial 80-case run passed 77 cases; two aggregate SSR checks exceeded their 30-second budget while Docker profiling ran concurrently, and one toast selector matched an inactive Activity tree. The four SSR variants now run as separate cases, the concurrent-language scenario has an explicit 60-second budget, and the toast assertion targets the visible notification. All 11 affected desktop/mobile/PWA cases passed on rerun, covering the final 86-case suite together with the preceding successful checks.
- The production build confirms all four internal homepage variants have complete static documents. `pnpm test:cache` asserts this and verifies byte-for-byte restoration of the service worker and MCP App HTML.
- `pnpm test:stack` passed with three runtime samples per image: 12 distroless production, 12 Node-slim production, and 11 development browser scenarios. Runtime checks, dependency-layer reuse, cached builds, manifest-triggered rebuilds, host-source preservation, and owned-resource cleanup passed. The ignored report is `test-results/stack/report.json` (run `prelude-stack-eeaaa609`).

`pnpm verify` ran the checks through production browser coverage; after the test corrections, focused browser reruns, `pnpm check`, and `pnpm test:cache` completed verification. The native preview was restored afterward. Routing tests cover fixed policies, session overrides, canonical prefix precedence, private hidden responses, pre-hydration links/controls, accessible switching, browser history, and localized missing pages. PWA acceptance confirms the actual controller object and dismissal state survive mode transitions without granting update approval.

## Localization pattern review

Verified on 2026-09-30 with Node 26.10.0 and pnpm 12.6.0: Biome, strict TypeScript, all 364 unit/component/script tests, four focused development browser scenarios, 14 focused production browser scenarios, the production build, and byte-for-byte widget/service-worker cache restoration passed. HTTP acceptance now checks the actual relative `Location` returned for explicit locale prefixes. Language-switching checks retain drafts, errors, filters, hashes, and browser history.

An isolated production Compose stack passed five routing checks with different public/internal ports: English home, Spanish filtered playground, HTTPS-forwarded rewrites, relative prefix removal, and localized missing routes with `noindex`. Its containers, image, network, and port were released. These are focused routing/hydration regression checks; the broader localization acceptance results below describe the preceding implementation.

The review removed redundant URL-header repair from the proxy. The documented `skipProxyUrlNormalize` workaround remains for the pinned framework's loopback-origin issue, and the terminal localized 404 catchall retains its narrowly scoped `instant` exemption. The selector keeps the server/client snapshot readiness guard, with explicit names and rationale. See [localization](i18n.md) for the framework references and upgrade considerations.

React Doctor completed full scans of both configured packages without skipped checks. It reported zero errors and no findings on the reviewed patterns; 11 advisory warnings remain elsewhere. The public language-cookie action's authentication false positive and the intentional offline full-navigation link have documented, rule-specific exceptions in [diagnostics](diagnostics.md#scoped-exceptions).

## Localization checks

Verified on 2026-09-30 (Europe/Madrid) with Node 26.10.0 and pnpm 12.6.0 on Windows: frozen installation and the complete `pnpm verify` workflow passed, including Biome, strict TypeScript, 364 unit/component/script tests across 32 files with coverage, eight native development browser scenarios, 72 production browser scenarios, the production build, and byte-for-byte Turbo restoration of the widget HTML and service worker.

Coverage includes English/Spanish browser detection and saved-cookie precedence, catalog parity and ICU formatting, concurrent request-isolated SSR, localized metadata and manifest identity, hydration without duplicate fetching, stable public URLs and browser filter history, and drafts/errors/pending actions surviving locale changes. The real Inspector renders both widget languages and exercises mutations; host-language changes preserve its connection, drafts, filter, and initial query data. Production PWA checks cover translated update notices, dismissal and per-tab approval, plus a precached offline fallback that selects bundled translations without network access. API identifiers, descriptions, JSON output, and task content retain their original values.

`pnpm test:stack --samples 1` passed all 29 container browser scenarios: ten on the distroless runtime, ten on the slim baseline, and nine on the development stack. Checks include standalone locale rewrites and public-origin redirects, runtime MCP toggling, dependency-layer reuse, cached unchanged builds, authenticated Inspector widgets, Fast Refresh draft preservation, shared-theme/catalog rebuilds, manifest-triggered container rebuilding, unchanged host source, and process/port cleanup. This sequential functional regression run uses one runtime sample per image and does not establish a new performance baseline. Widget build measurements including both languages are recorded in [MCP Apps](mcp-apps.md#measure-the-widget-build).

See [localization](i18n.md) for adding catalogs, cache ownership, state lifetimes, and the static offline document's brief English presentation before hydration.

## Task title editing checks

Verified on 2026-09-29 with Node 26.10.0 and pnpm 12.6.0 on Windows: frozen installation, Biome, strict TypeScript, 327 unit/component/script tests with coverage, three native development browser scenarios, 57 production browser scenarios, the production build, and byte-for-byte Turbo restoration of the widget HTML and service worker passed. Commands ran separately; the two Scalar scenarios passed on rerun after the test was corrected to close its Create dialog before navigating to Edit.

Coverage exercises title editing through RPC, REST, Scalar, modern/legacy MCP, the JSON explorer, and the real Inspector-hosted widget. Checks include title normalization and validation, unchanged completion and ID, missing tasks, path-ID protection, invalid outputs, awaited callbacks, isolation, optional/renamed tools, keyboard Save/Cancel, duplicate-save prevention, preserved drafts after failure, and cached rows remaining editable after a failed background refetch.

`pnpm test:stack --samples 1` passed all 16 container browser scenarios, runtime MCP toggling, dependency-layer reuse, manifest-triggered rebuilding, unchanged host source, and cleanup. Native production tests ran alongside this functional container check; its single runtime sample is not a new performance baseline.

## Task deletion checks

Verified on 2026-09-29 with Node 26.10.0 and pnpm 12.6.0 on Windows: frozen installation, Biome, strict TypeScript, 293 unit/component/script tests with coverage, three native development browser scenarios, 51 production browser scenarios, the production build, and byte-for-byte Turbo restoration of the widget HTML and service worker passed. The verification commands ran separately, with Scalar's desktop/mobile deletion scenarios rerun after correcting navigation and path-parameter selectors in the browser test.

Coverage includes deletion through RPC, REST, Scalar, modern/legacy MCP, the live workbench, and the real Inspector-hosted MCP App. Checks verify missing IDs, path-ID protection, output validation, isolated repositories, awaited callbacks, duplicate-action prevention, preserved drafts on failure, filter invalidation, and renamed/excluded widget tools.

`pnpm test:stack --samples 1` passed all 16 container browser scenarios across the distroless runtime, slim baseline, and development Inspector. Runtime MCP toggling, source-change dependency reuse, manifest-triggered rebuilding, unchanged host source, and cleanup passed. This was a functional regression run; its single runtime sample does not establish a new performance baseline.

## Playground and MCP App checks

Verified on 2026-09-29 with Node 26.10.0 and pnpm 12.6.0 on Windows: frozen installation and `pnpm verify` passed, including Biome, strict TypeScript, 271 unit/component/script tests with coverage, three native development browser scenarios, 47 production browser scenarios, the production build, and byte-for-byte Turbo restoration of the widget HTML and service worker.

The real Inspector preview exercised initial rendering without duplicate fetching, creation, completion, filtering, external-write refresh, a 360 px host frame, size notifications, and zero external widget asset requests under its restrictive CSP. It also exposed the pinned SDK's record-only bridge result validation; the explicit public result-schema adapter is covered by real SDK tests for modern arrays and legacy wrappers. Widget build measurements are recorded in [MCP Apps](mcp-apps.md#measure-the-widget-build).

The same source passed `pnpm test:stack` on Docker Engine 29.8.1, Compose 5.5.1, Linux amd64. Six production browser scenarios passed on each runtime, and four development scenarios passed, including the real widget over custom application/Inspector/sandbox ports and fresh resource reads after a shared-theme rebuild. Runtime MCP toggling, manifest-triggered rebuilding, unchanged host source, shutdown, and port cleanup passed. Both images contained identical application artifacts and the generated widget, with no tsdown, Tailwind CLI, or Inspector package in the runtime. See the [current container measurements](docker-measurements.md#playground-and-mcp-app-run).

The current browser workbench and JSON tool explorer live at `/playground`; Motion/Morphicons remain on `/`. Browser acceptance must cover navigation between the two pages, playground server rendering and hydration, task URL/history behavior, JSON tool execution, and the development-only Inspector link. Earlier dated results below describe the source and routes at the time they were recorded.

The MCP App adds protocol checks for UI metadata, HTML resource discovery/read, generated name changes, exclusions, unchanged modern/legacy JSON output, and masked asset failures. Widget tests cover result decoding, host input/result handling, query isolation, mutations/filter refresh, cancellation, and connection cleanup. Build tests check self-contained output and atomic replacement. `pnpm test:cache` restores both generated HTML and worker artifacts byte for byte.

The real preview requires Inspector's **Apps** interface: connect, select **List tasks** (`listTasks`), supply `status`, and choose **Open App**. Native and Docker development checks must exercise that sandboxed widget, including its controls and asset rebuild/reopen behavior; raw Tools calls alone do not verify rendering. Production must serve the resource from the built standalone artifact while Inspector paths remain absent. See [MCP Apps](mcp-apps.md) for port and CSP boundaries. Consult the current run outputs for pass/fail results; this section describes acceptance scope rather than a new measured run.

## Docker stacks

Run `pnpm test:stack` with Docker's Linux engine running and host dependencies installed. This separate acceptance command verifies the packaged production runtime and development workflow; `pnpm verify` continues to run natively without requiring Docker. See [Docker verification and measurements](docker.md#verification-and-measurements) for scope and prerequisites.

The run report is written to ignored `test-results/stack/report.json`. Inspect its completed checks, image-size measurements, timings, and platform information before reporting Docker acceptance. Results from native tests or an image build alone do not establish that the standalone runtime, service worker, MCP transports, or Compose Watch work in a container.

## Homepage MCP playground

Verified on 2026-09-29 with Node 26.10.0 and pnpm 12.6.0 on Windows: frozen installation and `pnpm verify` passed, including Biome, strict TypeScript, 205 unit/component/script tests with coverage, two development scenarios, all 43 production scenarios, the Turbopack/Serwist build, and byte-for-byte service-worker cache restoration. The live development playground was also inspected in the browser.

The desktop and mobile production projects exercise the real homepage playground: on-demand discovery, input/output schemas, keyboard execution, natural array results, malformed JSON, tool errors, discovery retries, and refreshing the catalog without stale output. Mutation checks cover duplicate clicks, normalized creation, completion, preserved drafts, and immediate RPC workbench refresh without a page reload. The disabled-runtime test verifies that `MCP_ENABLED=false` disables the playground as well as the endpoint.

Focused unit coverage exercises the action bridge with real SDK clients and isolated repositories: same-origin and development loopback guards, runtime enablement, identity forwarding and protocol-header isolation, paginated discovery, validation/errors, concurrent context isolation, mutation callbacks, timeouts/cleanup, and zero outbound requests. JSON editing helpers are checked separately. The SDK client is a web runtime dependency behind `server-only`; browser output is checked for accidental transport imports.

## Native MCP scenarios

Verified on 2026-09-28 with Node 26.10.0 and pnpm 12.6.0 on Windows:

- Frozen installation and the complete `pnpm verify` workflow passed: Biome, strict TypeScript, 183 unit/component/script tests with coverage, two development browser scenarios, and all 37 production scenarios.
- The actual Inspector CLI listed all three tools without mutations. The embedded Inspector connected with authentication enabled and executed create/update/list operations against the shared REST/RPC data; its screenshot was inspected.
- Production enablement was verified in both directions: disabling the endpoint after a normal build, and serving the default enabled endpoint from a build created with `MCP_ENABLED=false`. Inspector paths remained unavailable in production.
- Managed-process tests covered occupied ports, startup failures, shutdown, and parent/launcher termination with listening descendants. The production Turbopack/Serwist build, API/MCP cache exclusions, PWA updates and offline fallback passed; Turbo restored the generated service worker byte for byte.

The MCP unit suite covers tool generation from the shared OpenAPI document, flat parameter/body mapping, ArkType validation, protocol output conversion, immutable catalog reuse, failed generation retries, request isolation, and awaited mutation callbacks. Transport tests cover disabled access, development loopback restrictions, exact production Origin rules, no-store responses, and a development-only Inspector wrapper.

The production `mcp` Playwright project connects real SDK clients using both modern discovery and the legacy initialize handshake. It executes all five tools and checks that writes are visible through REST, RPC, and the rendered workbench. A separately owned production process starts with `MCP_ENABLED=false` against the existing build to prove that the switch applies at runtime while REST remains available. The test terminates only its own process tree. Production also checks that the Inspector wrapper and nested asset/backend paths return 404.

Development acceptance starts the actual pinned Inspector alongside Next.js on dedicated ports. It checks its authentication and origin protections, the full-viewport token-free iframe, manual connection, generated forms, and real create/title-edit/completion/delete/list calls. The resulting data is checked through REST and the RPC workbench. The wrapper never proxies Inspector backend or asset routes. The test saves `mcp-inspector.png` for visual review.

Run `pnpm test:dev` separately from an ordinary development session because both use the Next.js development output. The production MCP project runs within `pnpm test:e2e`; `pnpm verify` includes both. Do not run the production build or worker-cache checks concurrently with these servers. `pnpm mcp:check` provides a separate read-only Inspector CLI discovery check against a running application.

## Toast-based PWA update acceptance

Verified on 2026-09-28 with Node 26.10.0 and pnpm 12.6.0 on Windows:

- Frozen-lockfile installation and the complete `pnpm verify` workflow passed without adding dependencies.
- Biome, strict TypeScript, and all 106 unit/component/customization tests passed with V8 coverage. The new tests cover toast keyboard actions, persistence and dismissal, plus 19 lifecycle scenarios for registration races, per-tab approval, successive workers, timeout/retry, and cleanup.
- The development smoke test and all 33 production browser scenarios passed. Real worker replacements verified desktop/320px keyboard approval, reduced motion, exactly one document reload, preservation of another tab's draft until its own approval, and swipe dismissal followed by a newer update notification.
- The production Turbopack/Serwist build, existing API/docs cache exclusions and offline fallback, and byte-for-byte service-worker restoration from Turbo cache passed. Desktop and mobile toast screenshots were inspected.

Reload checks count document navigation requests and completed loads; Next.js same-document history synchronization does not count as another reload. Streamed hidden form markup is excluded by using the visible input's accessible name.

## OpenAPI and Scalar acceptance

Verified on 2026-09-28 with Node 26.10.0 and pnpm 12.6.0 on Windows:

- Frozen-lockfile installation and the complete `pnpm verify` workflow passed.
- Biome, strict TypeScript, and all 85 unit/component/customization tests passed with V8 coverage. The 25 OpenAPI tests cover generated operations, schema conversion failures, validation, REST/RPC consistency, request isolation, and mutation callbacks.
- The development smoke test and all 29 production browser scenarios passed across desktop, mobile, and PWA projects. Scalar checks exercise the pinned CDN renderer, narrow navigation, search, direct same-origin reads and writes, and workbench refetching.
- The Turbopack/Serwist production build passed. API/docs responses stayed outside service-worker caches, and offline fallback and user-controlled updates passed. Turbo restored the generated service worker byte for byte.

## pnpm 12 upgrade

Verified on 2026-09-28 with Node 26.10.0 and pnpm 12.6.0: frozen-lockfile installation and `pnpm verify` passed, including Biome, TypeScript, 60 unit/component/customization tests, one development browser test, 25 production browser scenarios, the production build, and byte-for-byte service-worker cache restoration.

The package-manager pin and engine requirement now use 12.6.0. pnpm added its own package-manager integrity metadata to the lockfile; application dependency versions remain unchanged. The cache verification script supports both JavaScript entrypoints and native pnpm executables.

Run from the workspace root with the documented Node and pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

No CI provider is configured. A future CI job can run these commands; on Linux runners, install Chromium's OS dependencies as required. Set `HUSKY=0` in the job environment if Git hooks should not be installed there. This does not replace the verification commands.

## Checks and scenarios

| Command | Coverage |
| --- | --- |
| `pnpm check` | Biome, strict TypeScript, and compile-only negative contract checks. |
| `pnpm test` | RPC/REST validation and procedure behavior, generated OpenAPI schemas, request/query/store isolation, URL parsing, Temporal behavior, and Testing Library component scenarios. |
| `pnpm test:coverage` | The same suite with V8 coverage reports in `coverage/`. |
| `pnpm test:ui` | Local Vitest watch UI on `127.0.0.1`; exit with Ctrl+C. |
| `pnpm test:dev` | Fresh Turbopack development server, initial rendering, interactions, and reloads without console/overlay errors. |
| `pnpm build` | Self-contained MCP App compilation, production Turbopack compilation, Cache Components rendering, and Serwist generation. |
| `pnpm test:e2e` | Build, then check production hydration, mutations, Scalar docs and requests, URL navigation, local state, offline fallback, and worker updates. |
| `pnpm test:cache` | Build, remove only known generated widget/worker artifacts, then confirm a Turbo cache hit restores identical bytes. |

`pnpm test:e2e` builds automatically and starts its own production server at `http://127.0.0.1:3100`; leave that port free. Desktop and mobile app scenarios block service workers to isolate UI behavior, while the PWA project allows them. The tests detect hydration errors, verify initial data without an immediate duplicate RPC fetch, create/edit/complete/delete tasks, navigate filters with history, check failed-request recovery, and verify compact view stays local to its browser context. Reports, traces, and failure screenshots go to ignored test output directories.

`pnpm test:dev` starts its own development server at `http://127.0.0.1:3102`. Stop ordinary `pnpm dev` first because both use the application's development output directory and lock. The smoke test captures all console errors and uncaught exceptions, exercises both animation previews, reloads, and checks Next.js's issues overlay. `pnpm verify` runs this check before building production; development-only validation errors can pass a production build.

Scalar scenarios verify the homepage link at 320px, the exact pinned CDN renderer, search and hash navigation, and real same-origin GET/POST/PATCH/DELETE requests. A task created in Scalar must appear in the server-rendered workbench and subsequent RPC queries. The rendering/search test rejects unexpected external requests; the pinned jsDelivr bundle is the only allowed external resource. These browser checks require access to that CDN. HTTP and schema tests run locally without it.

PWA scenarios inspect the manifest/icons, wait for a controlling worker, test a new navigation offline, and confirm RPC, REST, docs, specification, and RSC responses are absent from Cache Storage. Docs/spec/REST fetches must fail offline instead of returning cached responses.

Update scenarios change only the generated worker and explicitly call `registration.update()` to trigger a deterministic browser check; production code uses the browser's default timing without polling. They cover a quiet first installation, a waiting worker that stays inactive before approval, keyboard activation at desktop and 320px widths, reduced motion at 320px, one reload per approval, and pointer-swipe dismissal followed by notification for a newer worker. Both width checks save an `update-toast.png` screenshot in their test output directories. A two-tab scenario leaves an unfinished task draft in the second tab: approval in the first tab activates the worker, while the second tab retains its draft until its own **Reload now** action. Each test restores the original worker in cleanup. These scenarios share one production worker file and run serially; do not run another build or worker-update suite concurrently. If a run is forcibly interrupted, regenerate artifacts with `pnpm build --force` before retrying.

The cache check saves `apps/web/public/sw.js` and its map when present, removes only those explicit generated files, checks the restored hashes after a Turbo cache hit, and restores the saved bytes in `finally`. Do not run it alongside a development/production server or another build. Source files, the lockfile, and directories are not its cleanup targets.

## Commit hook regression

The `commit-msg` hook runs Commitlint with `@commitlint/config-conventional`. Use messages such as `feat: add task filters`, `fix(api): validate titles`, or `chore: update dependencies`. To check existing messages, run `pnpm commitlint --from HEAD~1 --to HEAD --verbose`. Source code is still checked by Biome.

The initial hook setup was checked with invalid staged code and a partially staged file: lint errors blocked the commit, while unstaged changes survived formatting. To repeat safely, use a disposable branch or temporary fixture, stage one hunk, change another without staging, and run `pnpm lint:staged`. Inspect both `git diff --cached` and `git diff` before committing.

## Initial acceptance run

Verified on 2026-09-25 with Node 24.19.0 and pnpm 11.19.0 on Windows:

- `pnpm install --frozen-lockfile`: passed.
- `pnpm verify`: passed formatting, linting, strict TypeScript, 18 Vitest tests, the production build, and 17 Chromium browser scenarios across desktop, mobile emulation, and PWA projects.
- The cache check restored `sw.js` with identical bytes after deleting it; this build does not emit a separate worker source map.
- The hook checks confirmed invalid staged code is rejected and unstaged changes survive safe fixes.

The browser suite also verifies the application remains usable when service-worker registration is blocked. The server-rendering scenario checks task markup with JavaScript disabled; it does not promise an interactive application without JavaScript. Re-run these checks after changes or dependency upgrades.

The subsequent Biome-only tooling change passed `pnpm check`, all 18 Vitest tests, `pnpm build`, and frozen-lockfile installation. Hook regression checks again confirmed safe fixes preserve unstaged edits and invalid staged code is rejected. Temporary application TSX fixtures confirmed that valid token classes pass and arbitrary values in both `className` and `cn(...)` fail Biome's native rule. Browser scenarios were not rerun for this tooling-only change.

## Test environments and coverage

Vitest's `node` project discovers `.test.ts` files under applications and packages. Its `dom` project discovers `.test.tsx` files and supplies jsdom, Testing Library cleanup, and jest-dom matchers. The DOM setup stubs `matchMedia`; use Playwright for real layout, hydration, service workers, and browser preferences. Keep asynchronous Server Component tests in Playwright.

Open the URL printed by `pnpm test:ui`, including its authentication token, to use the test explorer. The command stays in watch mode and binds its API to loopback.

`pnpm verify` runs coverage rather than running the unit suite twice. Coverage includes all `.ts` and `.tsx` source under `apps/*/src` and `packages/*/src`, including untested files. New applications, packages, and source files enter the report automatically. Tests, declaration files, and the compile-only `contract-types.ts` fixture are excluded.

Next.js pages, service-worker code, and shared UI components are included in that source inventory. Playwright checks integrated rendering and browser behavior separately; its execution does not contribute to Vitest coverage. Reports start without percentage gates so projects can set meaningful thresholds for their own code. Vitest, its UI, and its coverage provider are pinned to the same version.

## Node 26 and additional tooling acceptance

Verified on 2026-09-25 with Node 26.10.0 and pnpm 11.19.0 on Windows:

- Frozen-lockfile installation, Biome, and strict TypeScript passed.
- All 25 Vitest tests passed with V8 coverage, including native Temporal identity, an isolated polyfill fallback, DST/calendar behavior, keyboard form interaction, and reduced-motion icon updates.
- All 19 Chromium browser scenarios passed across desktop, mobile emulation, and PWA projects. These include server-rendered icons, hydration, keyboard density changes with reduced motion, mutations, URL history, offline fallback, and user-controlled worker updates.
- The production Turbopack/Serwist build passed, and Turbo restored the generated service worker byte for byte.
- The Vitest UI started in watch mode and ran the suite successfully. The actual Git `commit-msg` hook rejected an invalid message and accepted a Conventional Commit message.

## Recovering development client-manifest errors

The reported pair of errors on `/` had one underlying failure: Next.js could not find its internal `PlaceValidationBoundaryBelowThisLevel` component in the React Client Manifest. That blocked instant UI validation, producing the second diagnostic. The affected development session had experienced package resolution failures during dependency changes and was still running Node 22.22.2. A browser reload reproduced the errors; restarting after installation under Node 26.10.0 removed both errors without changing Next.js, Turbopack, Cache Components, or the validation settings.

This indicates stale development bundler state, not a missing application component. Stop the development server before package/runtime upgrades, verify the shell's `node --version`, complete `pnpm install --frozen-lockfile`, start `pnpm dev`, and reload the browser. Runtime version files do not change existing processes. If a restart alone does not recover generated state, stop the server and remove only `apps/web/.next/dev` before retrying. Do not disable instant validation or Cache Components to hide an unexplained error.

Next.js's installed [instant validation reference](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant) explains why these checks run in development. Use [React Doctor](diagnostics.md) for complementary source diagnostics, not as a substitute for this runtime check.

## Homepage examples and diagnostic tooling acceptance

Verified on 2026-09-25 with Node 26.10.0 and pnpm 11.19.0:

- Frozen-lockfile installation, Biome, strict TypeScript, and all 26 Vitest tests with coverage passed.
- The new development smoke test passed without console errors, uncaught exceptions, or a Next.js issues overlay.
- All 25 production browser scenarios passed across desktop, mobile, and PWA. The two no-JavaScript HTML checks were rerun after adding `includeHidden` to inspect streamed controls; the remaining 23 scenarios passed in the full run.
- Browser checks cover both motion preferences, keyboard controls, tile movement, bookmark path changes, independent preview state, and duplicate-submission prevention.
- The production build and byte-for-byte service-worker restoration passed. The homepage previews were also inspected in the browser.
- React Doctor's human-readable and JSON commands completed with zero findings after the documented scoped exceptions. Both packages reported `complete: true` and no skipped checks.

## Creating a project from the public template

The [create-next-app example workflow](https://nextjs.org/docs/app/api-reference/cli/create-next-app#with-any-public-github-example) downloads public GitHub repositories. The initial test against private Prelude failed with “Could not locate the repository”; it downloaded successfully after the owner made Prelude public.

For this monorepo, generate files first and install dependencies afterward:

```sh
pnpm dlx create-next-app@16.3.6 my-app --example https://github.com/ivanpajon/Prelude --use-pnpm --skip-install --yes
cd my-app
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

Without `--skip-install`, create-next-app 16.3.6 finishes successfully but attempts `next typegen` at the repository root, where the Next.js executable is not installed. It also runs the Husky install before creating `.git`. The two-step workflow avoids both warnings. The normal workspace type-check command generates the Next.js route types in `apps/web`.

The generated copy has a new initial commit, no remote, the original workspace package names and Prelude branding, and an unchanged lockfile. After installation, `core.hooksPath` points to `.husky/_`. Rename the root package and application branding as part of customization; the folder name alone does not rename template content.

On 2026-09-25, the two-step workflow was tested in a fresh Windows temporary directory against Prelude commit `71cf82b`, using Node 26.10.0, pnpm 11.19.0, and create-next-app 16.3.6. `pnpm verify` passed: Biome, TypeScript, 26 unit/component tests with coverage, one development browser scenario, 25 production browser scenarios, the production build, and service-worker cache restoration. The copied project used its own workspace dependencies and initially empty build caches.

## Project customization acceptance

The optional `pnpm customize` command preserves `@repo` unless the consumer supplies a scope. Its 34 regression cases use isolated temporary Git repositories to verify name/scope independence, exact package references and subpaths, all configuration targets, ignored files, untracked files, dry runs, invalid arguments, dependency collisions, duplicate names, repeat renames, and failure recovery. The Windows checks exercise temporary paths containing spaces and 8.3 user-directory aliases.

On 2026-09-25, a separate consumer copy was customized with `pnpm customize --name sonata-app --scope "@sonata"`. The command successfully updated package names and references, refreshed the workspace links and lockfile, and passed Biome, TypeScript, and the unit/component suite. A subsequent frozen-lockfile installation, production build with Serwist, and two production browser checks passed. Those browser checks exercised hydration without duplicate RPC requests and a task mutation surviving reload, using the renamed package filter in Playwright's server command.

Rerunning the final command on that consumer reported zero file changes and passed all 60 tests, including the new customization regressions. The original Prelude workspace retained its root name and `@repo` scope. No dependency was added for customization; application branding remains a separate manual step.
