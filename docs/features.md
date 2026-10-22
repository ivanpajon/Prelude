# Optional features

A project created from this template starts with every feature below. Keep the ones you need and remove the others before you build on the project. In the first session, a coding agent asks which ones to keep (see `AGENTS.md`) and follows this guide.

## Features

<!-- demo:start -->
- **Task demo:** the shared in-memory task list, `/playground` with the task workbench and the MCP explorer, and the task MCP App. Remove it before the project holds private or persistent data.
<!-- demo:end -->
- **Docker:** the production image, the development stack with Compose Watch, `pnpm stack:*` and `pnpm test:stack`, and the Docker CI lane.
- **React Doctor:** optional React diagnostics for people and agents.
- **Renovate:** grouped pull requests that keep dependencies up to date.
- **MCP:** the procedures as MCP tools at `/api/mcp`, the MCP Inspector that `pnpm dev` starts, and `pnpm mcp:check`. You can also drop only the Inspector.
- **OpenAPI and Scalar:** REST endpoints, the `/api/openapi.json` document, and the Scalar reference at `/api/docs`. RPC stays.
- **PWA and offline:** the Serwist service worker, the offline page, and the update notices. The web app manifest and icons stay.
- **Second language:** Spanish next to English, and the **Language in URL** switch. Keep only English, or only Spanish.
- **Theme toggle:** the header's light, dark, and system menu.
- **Animation:** the home page previews, and Motion and Morphicons in `@repo/ui`.
- **Temporal:** `@repo/temporal`, a Temporal polyfill package that the template's code doesn't import.

## Order and dependencies

Remove features in the order of the list above.

<!-- demo:start -->
- `pnpm remove-demo` refuses to run with uncommitted changes, so the demo goes first. If the Git tree has changes, ask the user to commit or stash them.
- MCP, OpenAPI, and Motion as a whole need the demo gone: the MCP explorer and the MCP App use MCP, and the task workbench uses Motion. To keep the demo, keep these features too.
<!-- demo:end -->
- Docker, React Doctor, and Renovate go before the app features. The later sections edit their files (Compose files, stack tests, Renovate groups, diagnostics rows) only when they exist.
- OpenAPI needs MCP gone: MCP builds its tools from the OpenAPI document.

When a step names a file that an earlier removal already deleted, skip that part of the step. Each section ends with a search for leftovers. Matches in `docs/verification-history.md` and `docs/docker-measurements.md` can stay: they are dated records of the template, which the README's "Make it yours" checklist suggests deleting.

## Finish

1. Remove dependencies with pnpm, never by editing `pnpm-lock.yaml`: `pnpm --filter <package> remove <name>`, or `pnpm remove -w <name>` for the root. pnpm may print "Already up to date" and still change the lockfile.
2. Run `pnpm fix`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm exec playwright test --list`. The list fails when `browserSpecs` in `playwright.config.ts` names a deleted spec.
3. Stop `pnpm dev`, then run `pnpm verify` for the browser tests. If the project keeps Docker, also run `pnpm test:stack`.
4. Delete the removed features from this guide: their entries in the list and their sections.
5. Review `git status` and `git diff`, and report what you removed. Commit only if the user asks.

<!-- demo:start -->
## Task demo

Run `pnpm remove-demo`, or `pnpm remove-demo --dry-run` to preview it. It deletes the demo, reinstalls, formats, checks, and tests the project, and then removes itself. See [Remove the demo](remove-demo.md).

<!-- demo:end -->
## Docker

The app doesn't need Docker: `pnpm build` and `pnpm start` run natively. The development launcher's `--container` option and the `NEXT_OUTPUT_STANDALONE` switch exist only for the image.

1. Delete `Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.dev.yaml`, the root `.env.example` (it holds only Compose overrides; keep `apps/web/.env.example`), `scripts/test-stack.mjs`, `scripts/stack-image-size.mjs` and its test, `scripts/docker-workflow.test.mjs`, `tests/stack/`, `playwright.stack.config.ts`, `.github/workflows/docker.yml`, `docs/docker.md`, and `docs/docker-measurements.md`.
2. In the root `package.json`, delete the `stack:prod`, `stack:dev`, `test:stack`, and `test:stack:quick` scripts.
3. CI: in `.github/workflows/ci.yml`, delete the `docker-smoke` job and the comments about `docker.yml`. In `.github/actions/setup/action.yml`, delete the `compose` input and the "Install Docker Compose" step.
4. In `scripts/dev-web.mjs`, remove the `--container` option (its help lines, the `parseArgs` entry, and the `--container`/`--hostname` check; the hostname is always `127.0.0.1`) and the `DANGEROUSLY_BIND_ALL_INTERFACES` opt-in. In `scripts/dev-web.test.mjs`, delete the container tests and make the fixture listen on `127.0.0.1`.
5. In `apps/web/next.config.ts`, delete the `NEXT_OUTPUT_STANDALONE` spread and the `path` import it used, and reword the Docker comment above `allowedDevOrigins`, which stays. Delete `"env": ["NEXT_OUTPUT_STANDALONE"]` from `tasks.build` in `turbo.json`, and `PRELUDE_STACK_.*` from `allowedEnvVars` in `biome.json`.
6. In `renovate.json`, remove `docker:pinDigests`, the custom manager for the `Dockerfile`, the Distroless image in the Node.js group, and the Dockerfile wording in the rule descriptions.
7. In `scripts/customize.mjs`, delete the BuildKit `cacheIds` block, the `Dockerfile` exception in the file filter, and the `details` output, and drop `docs/docker-measurements.md` from `untouched`. In `scripts/customize.test.mjs`, delete the Docker cache id test and the `docs/docker-measurements.md` entry.
8. Docs:
   - `README.md`: the Docker paragraph under "Start locally", the `stack:*` and `test:stack*` rows, the Docker CI sentences, and the Docker notes in "Make it yours". In **Deploy**, drop the Docker image advice and link to `docs/architecture.md#deploying-on-a-server`.
   - `AGENTS.md`: the `pnpm test:stack` command and rule, and the Docker lane and guide. The environment-variable rule names only `apps/web/.env.example`, without the Compose `environment:` maps.
   - `docs/architecture.md`: move the general part of "Deploying on a server" from `docs/docker.md` here as `## Deploying on a server` (HTTPS, Host forwarding, the nginx example, several servers, no authentication), and point the links that went to it here.
   - `docs/verification.md`: the `test:stack` rows, "Docker stacks", the stack results row, the **Docker smoke** row, and the `docker.yml` lane. Rewrite the CI paragraphs for one workflow.
   - The other mentions of Docker, Compose, `test:stack`, `docker.yml`, and `docker-measurements.md` in `docs/customization.md` ("Three files" becomes "Two files"), `docs/requirements.md`, `docs/i18n.md`, `docs/mcp.md`, `docs/mcp-apps.md`, `docs/motion.md`, `docs/openapi.md`, and `docs/remove-demo.md`. In `docs/verification-history.md`, remove only the link to `docker-measurements.md`.

<!-- demo:start -->
If the demo is still present, remove the deleted paths from the lists in `scripts/remove-demo.mjs`: `tests/stack/demo` from `delete`, and `.github/workflows/docker.yml`, `compose.dev.yaml`, `docs/docker.md`, `playwright.stack.config.ts`, `scripts/docker-workflow.test.mjs`, and `scripts/test-stack.mjs` from `marked`. Its test fails when a listed path no longer exists. CI then checks a demo-free copy only with the **Demo removal (quick)** job, which runs no browser tests.

<!-- demo:end -->
Search: `git grep -n -i -E "docker|compose|test:stack|tests/stack|playwright\.stack|NEXT_OUTPUT_STANDALONE|PRELUDE_STACK|--container"`. The `is-docker` entries in `pnpm-lock.yaml` belong to other packages.

## React Doctor

Nothing in the build, CI, or `pnpm verify` runs React Doctor.

1. Run `pnpm remove -w react-doctor`, and delete the `react-doctor` and `react-doctor:json` scripts from the root `package.json`.
2. Delete `doctor.config.json`, `apps/web/doctor.config.json`, `packages/ui/doctor.config.json`, and `docs/diagnostics.md`.
3. In `scripts/customize.test.mjs`, delete the `doctor.config.json` fixture and its entry in the expected list of changed files.
4. Docs: React Doctor in `README.md` (the **Feedback for humans and agents** bullet, the two command rows, and the React diagnostics link), `AGENTS.md` (the `react-doctor:json` command and the guide link), `docs/requirements.md`, `docs/verification.md`, and `docs/customization.md`.

<!-- demo:start -->
If the demo is still present, remove `"docs/diagnostics.md"` from `marked` in `scripts/remove-demo.mjs`.

<!-- demo:end -->
Search: `git grep -n -i doctor`.

## Renovate

Nothing in the build or the tests reads `renovate.json`. Without it, update dependencies by hand.

1. Delete `renovate.json` and its line in `.dockerignore`.
2. In `README.md`, delete the **Dependency updates** step of "Make it yours". In `AGENTS.md`, delete the sentence about Renovate in the dependencies convention.
3. In `docs/requirements.md`, keep the **Dependency updates** heading, which other guides link to, and replace the Renovate paragraphs with a short manual policy: `pnpm update --interactive --recursive --latest`, exact versions, and the values that change together. Those are the Node images in `Dockerfile` with `@types/node`; the Dockerfile's pnpm with `packageManager` and `engines.pnpm`; the `biome.json` schema URL with Biome; and `scalarScriptUrl` with `scalarScriptIntegrity` in `apps/web/src/lib/api-info.ts`. Workflow SHA pins and image digests are updated by hand too.
4. Reword the Renovate mentions in `docs/docker.md`, `docs/openapi.md`, and `docs/verification.md`, and the comments in `apps/web/src/lib/api-info.ts` and `tests/e2e/openapi.spec.ts`.

<!-- demo:start -->
If the demo is still present, also reword the comment in `tests/e2e/demo/openapi.spec.ts`.

<!-- demo:end -->
Search: `git grep -n -i renovate`.

## MCP

MCP serves the procedures as tools at `/api/mcp`. `pnpm dev` also starts the pinned MCP Inspector on ports 6274 and 6275 and shows it at `/api/mcp/inspector`.

### Only the Inspector

`/api/mcp` and `pnpm mcp:check` stay; the check runs the Inspector's command-line client, not its web interface.

1. In `scripts/dev-web.mjs`, remove the `--no-inspector` option, the `MCP_ENABLED` skip, the `MCP_INSPECTOR_PORT` and `MCP_SANDBOX_PORT` parsing, the Inspector command and its environment, the `beforeServers` of Next.js, and the `listeners` support in `assertPortsAvailable`, `probe`, and `waitUntilReady`. `readyMessage()` returns `Next.js: http://127.0.0.1:<port>`; update the help text. Keep `scripts/dev-child-lifetime.mjs`: every child process uses it.
2. Move `inspectorEnvironment()` into `scripts/mcp-check.mjs` as `checkEnvironment(root, env)` for `checkCommand`. Keep the `MCP_*` and `DANGEROUSLY_*` scrub, the memory secret store, auto-open off, the `.tools/mcp-inspector` paths, and `NO_PROXY`; drop the ports, the sandbox, `HOST`, and `ALLOWED_ORIGINS`. Keep the root `@modelcontextprotocol/inspector` dependency and its entries in `pnpm-workspace.yaml`.
3. In `scripts/dev-web.test.mjs`, rewrite the option, ready-line, and command tests for Next.js alone, test the dotenv precedence with `PORT`, delete the Inspector, sandbox, and auxiliary-server tests with their fixture code, and move the environment scrub test to the MCP check tests. Remove the `dev:app` script from `package.json` and its assertion.
4. Delete `apps/web/src/app/api/mcp/inspector/`, `apps/web/src/lib/mcp-inspector.ts`, and the local Inspector wrapper tests in `apps/web/src/lib/mcp-access.test.ts`. In `apps/web/src/proxy.test.ts`, use `/api/mcp` instead of `/api/mcp/inspector`. Drop the Inspector from the CSP comment in `apps/web/next.config.ts`.
5. Remove `MCP_INSPECTOR_PORT` from `apps/web/src/env.ts` and `env.test.ts`, and `MCP_INSPECTOR_PORT` and `MCP_SANDBOX_PORT` from both `.env.example` files and `compose.dev.yaml`, with their published ports. The Compose healthcheck then probes only `/api/health`.
6. Delete `tests/dev/mcp-inspector.spec.ts`. In `playwright.dev.config.ts`, drop the `env` with the Inspector ports and wait for `/Next\.js: http/`. Delete the `/api/mcp/inspector` checks in `tests/e2e/mcp.spec.ts` and `tests/stack/production.spec.ts`. In `tests/stack/development.spec.ts`, replace the Inspector test with an MCP SDK client that lists the tools of `/api/mcp`.
7. In `scripts/test-stack.mjs`, remove the Inspector and sandbox ports, `PRELUDE_STACK_INSPECTOR_URL` and `PRELUDE_STACK_SANDBOX_URL`, `redact()`, the `/api/mcp/inspector` assertion, and the Inspector ports in the port-release check. Rename the report key `developmentInspectorAndHmr` to `developmentMcpAndHmr`.
8. Docs: the Inspector in `README.md` and `AGENTS.md` (`pnpm dev`, `pnpm dev:app`, `pnpm stack:dev`, `pnpm test:dev`), the local Inspector, port, and wrapper paragraphs in `docs/mcp.md`, and the Inspector in `docs/docker.md`, `docs/verification.md`, `docs/architecture.md`, `docs/requirements.md`, `docs/i18n.md`, and `docs/openapi.md`.

<!-- demo:start -->
If the demo is still present, the tests that render the MCP App in the Inspector go too:

- Delete `tests/dev/demo/mcp-inspector.spec.ts`, `mcp-apps.spec.ts`, and `mcp-apps-es.spec.ts`, the `demo-es` project in `playwright.dev.config.ts`, the MCP App sentence in `playwright.stack.config.ts`, `exerciseTaskApp` in `tests/demo/mcp-apps.ts` (keep `expectTaskAppResource`), the three Inspector tests in `tests/stack/demo/development.spec.ts`, and the `developmentMcpAppSandbox` entry in `scripts/test-stack.mjs`.
- Remove the **Open Inspector** link from the playground page (always show `connectionHelp`) and its assertion in `tests/e2e/demo/app.spec.ts`, and `Playground.openInspector`, `Playground.inspectorHelp`, and the Inspector sentence of `connectionHelp` from every `site.json`.
- In `docs/mcp-apps.md`, replace "Preview in Inspector" with how to preview the widget in an MCP Apps client, or in an Inspector started by hand (`pnpm exec mcp-inspector --web --server-url http://127.0.0.1:3000/api/mcp --transport http`), and delete "Ports and Docker". Update `docs/remove-demo.md`.

<!-- demo:end -->
Search: `git grep -n -i -E "inspector|6274|6275|dev:app"`. `pnpm mcp:check`, its dependency, and mentions of the Inspector as an example MCP client stay.

### MCP as a whole

1. Delete `apps/web/src/app/api/mcp/`, `apps/web/src/lib/mcp.ts`, `mcp.test.ts`, `mcp-access.ts`, `mcp-access.test.ts`, `mcp-endpoint.ts`, `mcp-inspector.ts`, `apps/web/src/testing/mcp-tool-names.ts`, `scripts/mcp-check.mjs`, and `scripts/mcp-check.test.mjs`. Remove the `mcp:check` and `dev:app` scripts from the root `package.json`.
2. Keep `scripts/dev-web.mjs` and `scripts/dev-child-lifetime.mjs`: they still guard the port and stop the Next.js process tree. In `dev-web.mjs`, remove the `--no-inspector` option, the `MCP_*` help lines, `skipInspector`, `inspectorPort`, and `sandboxPort` (`parseDevOptions` returns `{ port, hostname }`), and `inspectorEnvironment`. `devCommands` returns only the Next.js command, with `env: { ...env, PORT }`; drop `listeners` from `assertPortsAvailable` and `waitUntilReady`; `readyMessage` returns `Next.js: http://127.0.0.1:<port>`. In `dev-web.test.mjs`, delete the Inspector, sandbox, auxiliary-server, `dev:app`, and MCP check tests with their fixture code, and test the dotenv precedence with `PORT`. In `playwright.dev.config.ts`, drop the Inspector `env` and wait for `/Next\.js: http/`.
3. Remove `MCP_ENABLED`, `MCP_ALLOWED_ORIGINS`, `MCP_INSPECTOR_PORT`, and `MCP_SANDBOX_PORT` from `apps/web/src/env.ts` (keep its `problems` list for future variables, and drop `parseOrigin`), `env.test.ts`, both `.env.example` files, `compose.yaml`, and `compose.dev.yaml` (with ports 6274 and 6275 and the healthcheck's Inspector probes). `apps/web/src/instrumentation.test.ts` then mocks `./env` with `vi.mock` to test the exit on invalid variables.
4. Run `pnpm --filter @repo/web remove @modelcontextprotocol/client @modelcontextprotocol/server mcp-from-openapi zod` (only the MCP SDK uses `zod`) and `pnpm remove -w @modelcontextprotocol/client @modelcontextprotocol/inspector`. In `pnpm-workspace.yaml`, remove the Inspector from `allowBuilds` and delete the `permissions` block. Delete the "MCP SDK" group in `renovate.json`, `.tools/` in `.gitignore`, and `.tools` in `.dockerignore`.
5. Shared tests: delete the MCP tool-call test in `apps/web/src/lib/api-errors.test.ts`; remove the `x-mcp` `spec` callback and `readOnly` from `apps/web/src/testing/fixture-api.ts` and the matching line in `openapi.test.ts`; drop `/api/mcp/inspector` from `apps/web/src/proxy.test.ts` and `/api/mcp` from `tests/e2e/pwa.spec.ts`.
6. Browser and stack tests: delete `tests/e2e/mcp.spec.ts` with its `mcp` project in `playwright.config.ts`, and `tests/dev/mcp-inspector.spec.ts`. In `tests/stack/production.spec.ts`, remove the MCP client, `listToolNames`, the Inspector checks, and the MCP tests; in `tests/stack/development.spec.ts`, delete the Inspector test. Remove `apps/web/src/testing/**` from the `paths` filter in `.github/workflows/docker.yml`.
7. In `scripts/test-stack.mjs`, remove the Inspector and sandbox ports, `PRELUDE_STACK_INSPECTOR_URL` and `PRELUDE_STACK_SANDBOX_URL`, the `MCP_ENABLED=false` toggle and its restart, `redact()`, `.tools` in the copy filter, and the extra ports in the cleanup check. Rename `developmentInspectorAndHmr` to `developmentHmr`. `buildTools` listed only the Inspector; list another build-only package instead, such as `vitest`.
8. `site.slug` in `apps/web/src/site.ts` only names the MCP server: delete it and its row in `apps/web/src/components/site-footer.test.tsx`. Fix the comments that name MCP in `apps/web/next.config.ts`, `apps/web/src/app/api/health/route.ts`, `apps/web/src/lib/request-context.ts`, `apps/web/src/lib/openapi.ts`, and `packages/ui/src/styles/theme.css`.
9. Docs: delete `docs/mcp.md`, and remove MCP, the Inspector, `pnpm dev:app`, `pnpm mcp:check`, and the MCP variables and ports from `README.md` (including the slug in "Make it yours"), `AGENTS.md`, `docs/architecture.md`, `docs/docker.md`, `docs/openapi.md`, `docs/requirements.md`, `docs/verification.md`, `docs/i18n.md`, and `docs/diagnostics.md`.

Search: `git grep -n -i -E "mcp|inspector|6274|6275|dev:app"`. `/_next/mcp` in `docs/skills.md` is Next.js's own endpoint and stays.

## OpenAPI and Scalar

RPC (`/api/rpc`), the contracts, and direct server calls stay.

1. Delete `apps/web/src/app/api/[...rest]/route.ts`, `apps/web/src/lib/openapi.ts`, `openapi.test.ts`, `apps/web/src/lib/api-info.ts`, and `tests/e2e/openapi.spec.ts`, and remove `"openapi.spec.ts"` from `browserSpecs` in `playwright.config.ts`.
2. Run `pnpm --filter @repo/web remove @orpc/openapi @orpc/arktype @ark/schema`. Keep `@orpc/contract`, `@orpc/server`, `@orpc/client`, `@orpc/tanstack-query`, and `arktype`.
3. Remove the **API docs** link from `apps/web/src/components/site-header.tsx`, the OpenAPI link from the stack card in `apps/web/src/app/[routingMode]/[locale]/page.tsx`, and `Common.apiDocs` from every `site.json`.
4. In `apps/web/src/lib/api-errors.ts`, `Transport` becomes `"rpc"` alone. Rewrite `api-errors.test.ts` over RPC: a failing procedure, invalid output, client errors, and a 5xx outside a procedure (an `os.handler` whose output getter throws while the response is encoded). In `apps/web/src/testing/fixture-api.ts`, drop the `.route(...)` calls and `fixtureSpecOptions`.
5. Tests: in `apps/web/src/proxy.test.ts`, use an RPC path instead of `/api/docs` and `/api/openapi.json`. In `tests/e2e/app.spec.ts`, check the headers on `/api/health` only. In `tests/e2e/i18n.spec.ts`, drop the `apiInfo` import and the document comparison. In `tests/e2e/pwa.spec.ts`, `apiPaths` is only `/api/health`. In `tests/i18n-scenarios.ts`, use the **Next.js docs** link as the header's stable link: `{ name: /^Next\.js docs/ }`, `{ name: /^Documentación de Next\.js/ }`, and `href: "https://nextjs.org/docs"`. In `tests/stack/production.spec.ts`, drop the `api-info` import, the docs and document routes, and the Scalar test.
6. Remove `apps/web/src/lib/api-info.ts` from the `paths` filter in `.github/workflows/docker.yml`, and the Scalar custom manager and package rule from `renovate.json`. Reword the CSP comment in `apps/web/next.config.ts` (API routes stay excluded) and the comments in `apps/web/src/app/api/health/route.ts` and `apps/web/src/lib/request-context.ts`.
7. Docs: keep the procedure guide. Rename `docs/openapi.md` to `docs/api.md` ("API procedures"); keep "Add or change a procedure" (without `.route`, Scalar, and `api-info.ts`), the ArkType note, and "Call a procedure from the app"; replace the endpoint, converter, and Scalar sections with short "Requests" and "Caching" sections; and point the links to it. Remove REST, OpenAPI, Scalar, and `/api/docs` from `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/requirements.md`, `docs/verification.md`, `docs/docker.md`, `docs/i18n.md`, and `docs/diagnostics.md`.

Search: `git grep -n -i -E "openapi|scalar|\bREST\b|api/docs|api-info|apiDocs"`.

## PWA and offline

The web app manifest and icons don't need the service worker: they keep giving browsers the name, colors, and icons.

1. The manifest's description is in the PWA catalog. Move `manifestDescription` from each `pwa.json` to `Home.manifestDescription` in the same language's `site.json`, and make `apps/web/src/app/manifest.ts` and `manifest.test.ts` read it with `getMessages` from `@repo/i18n/messages`.
2. Delete `apps/web/serwist.config.js`, `apps/web/src/app/sw.ts`, the `apps/web/src/app/(standalone)` folder (only `/offline` uses it), `apps/web/src/components/pwa-provider.tsx`, `apps/web/src/lib/pwa-update-controller.ts`, and their tests.
3. In `apps/web/src/app/[routingMode]/[locale]/layout.tsx`, remove the `Toaster` and the `PwaProvider` (keep `<Providers>{children}</Providers>`), `getTranslations("Pwa")`, and `Pwa` in the messages. Keep `@repo/ui/components/toast`, and mount a `Toaster` again when you need notifications.
4. Delete `packages/i18n/src/pwa.ts`, `pwa.test.ts`, and every `pwa.json`. Remove the `./pwa` export from `packages/i18n/package.json`, and the `pwa.json` imports and `Pwa` entries from `packages/i18n/src/messages.ts`.
5. Delete the `@serwist/next` override in `pnpm-workspace.yaml`, run `pnpm --filter @repo/web remove @serwist/next @serwist/cli serwist`, and drop ` && serwist build` from the `build` script in `apps/web/package.json`.
6. Remove the configuration of the generated worker: the `/sw.js` headers in `apps/web/next.config.ts`; `|offline(?:/|$)` in the matcher of `apps/web/src/proxy.ts` and the `/offline` and `/sw.js` cases in `proxy.test.ts`; `public/sw.js` and `public/sw.js.map` in the `turbo.json` build outputs; the `apps/web/public/sw*` lines in `.gitignore` and `.dockerignore`; the Serwist comment in `Dockerfile` (keep copying `public`); the Serwist group in `renovate.json`; the `offline-content.tsx` override in `apps/web/doctor.config.json`; and the offline page in the comments of `apps/web/src/site.ts`.
7. In `scripts/verify-build-cache.mjs`, remove `publicDirectory`, `worker`, and the service-worker assertion, and build `saved` from the `generated` list alone, after asserting that each file exists.
8. Browser tests: move "publishes an installable manifest and valid installation icons" from `tests/e2e/pwa.spec.ts` to `tests/e2e/app.spec.ts` without its `/sw.js` and polyfill checks. Then delete `pwa.spec.ts`, `pwa-helpers.ts`, and the `pwa` project in `playwright.config.ts`. Delete the offline and worker-update tests in `tests/stack/production.spec.ts`, "does not attempt service-worker registration" in `tests/stack/development.spec.ts`, and the `serviceWorkers` line in `playwright.stack.config.ts`.
9. Docs: in `AGENTS.md`, "works as a PWA with Serwist", the service worker in the `pnpm verify` rule, and the `sw.js` generated-files bullet. In `README.md`, the PWA, Serwist, and offline mentions; the install description in "Make it yours" is now `Home.manifestDescription`. In `docs/architecture.md`, replace "PWA boundary" and the toast paragraphs with a short "Web app manifest" section that says how to mount a `Toaster`. In `docs/i18n.md`, replace "PWA and offline behavior" with the manifest paragraph, and drop the PWA files from "Use one language". Remove the service worker, Serwist, and offline sentences from `docs/docker.md`, `docs/verification.md`, `docs/requirements.md`, `docs/diagnostics.md`, `docs/openapi.md`, and `docs/mcp.md`.

<!-- demo:start -->
If the demo is still present, also change the `to:` value of the `scripts.build` entry in `scripts/remove-demo.mjs` to `"next build --turbopack"` (or the command would bring `serwist build` back), delete `tests/e2e/demo/pwa.spec.ts` and the playground cache and worker-update tests in `tests/stack/demo/production.spec.ts`, and update `docs/mcp-apps.md` and `docs/remove-demo.md`.

<!-- demo:end -->
Search: `git grep -n -i -E "serwist|pwa|service.worker|offline|sw\.js"`. `serviceWorkers: "block"` in the Playwright configs stays.

## Second language

Follow [Use one language](i18n.md#use-one-language). It keeps the language infrastructure, so you can add a language back later, and turns off the **Language in URL** switch.

## Theme toggle

The header's theme menu uses `next-themes`, which sets `data-theme` on `<html>`. Without it, the website is light only.

1. Delete `apps/web/src/components/theme-toggle.tsx`, its test, and `apps/web/src/components/theme-provider.tsx`.
2. In `apps/web/src/app/[routingMode]/[locale]/layout.tsx`, `apps/web/src/app/(standalone)/layout.tsx`, and `apps/web/src/app/global-error.tsx`, remove the `<ThemeProvider>` wrapper but keep its children, its import, the comment about `next-themes`, and `suppressHydrationWarning` on `<html>`.
3. In `apps/web/src/components/site-header.tsx`, remove `<ThemeToggle />` with its import, and `dark:invert` on the logo.
4. Remove `Common.theme` from every `site.json`, and the test "keeps the chosen color theme after a reload" from `tests/e2e/app.spec.ts`.
5. Run `pnpm --filter @repo/web remove next-themes`.
6. In the first comment of `packages/ui/src/styles/theme.css`, say that MCP hosts set `data-theme` for the MCP App widget. Keep the dark tokens and the `dark` variant for the widget. The other `dark:` classes are harmless: nothing on the site sets `data-theme="dark"`, and `:root` sets `color-scheme: light`.

Search: `git grep -n -i -E "next-themes|theme-toggle|ThemeToggle|ThemeProvider|suppressHydrationWarning"`.

## Animation

### Home page previews

1. Delete `apps/web/src/components/animation-examples.tsx`, its test, and `tests/e2e/animation-examples.spec.ts`, and remove that spec from `browserSpecs` in `playwright.config.ts`.
2. On the home page, `apps/web/src/app/[routingMode]/[locale]/page.tsx`, remove the `<MotionProvider>` block and the `AnimationExamples` and `MotionProvider` imports.
3. Remove the `Animation` messages from every `site.json`, and `Animation` from the messages that `apps/web/src/app/[routingMode]/[locale]/layout.tsx` passes to the client.
4. Docs: the previews sentence in the README's "Home page" step; in `docs/motion.md`, the previews paragraph, the removal steps, and the mentions of the home page; `Animation` and its `getTranslations` example in `docs/i18n.md`; and the previews in `docs/architecture.md`, `docs/mcp-apps.md`, `docs/verification.md`, and `docs/diagnostics.md`.

### Motion and Morphicons

Remove the previews first.

1. Delete `packages/ui/src/components/motion-provider.tsx`, `morph-icon.tsx`, `morph-icon.test.tsx`, and `packages/ui/src/lib/motion-features.ts`.
2. Run `pnpm --filter @repo/ui remove motion morphicons` and `pnpm --filter @repo/web remove motion lucide`. Keep `lucide-react`, the shadcn icon library.
3. In `apps/web/doctor.config.json`, delete the `require-reduced-motion` override for `package.json`.
4. Docs: delete `docs/motion.md` and its link in `AGENTS.md`. Remove the Motion provider from the README's "Then build on the starter", the Motion wrappers from `docs/architecture.md`, the Motion bullet from `docs/requirements.md`, and the `review-animations` row, its install command, and the Motion paragraphs from `docs/skills.md`. In `docs/diagnostics.md`, delete the `require-reduced-motion` row and the `domMax` sentence, and change the scoped-override example to an exception that still exists.

Search: `git grep -n -E "MotionProvider|MorphIcon|motion-features|morphicons|motion/react|docs/motion"`. CSS classes such as `motion-safe:` and reduced-motion emulation in tests stay.

## Temporal

1. Check that nothing imports it: `git grep -n "@repo/temporal" -- apps packages tests scripts` lists only `apps/web/package.json` and `apps/web/next.config.ts`.
2. Run `pnpm --filter @repo/web remove @repo/temporal`, delete the whole `packages/temporal` folder and `docs/temporal.md`, then run `pnpm install`.
3. Remove `"@repo/temporal"` from `transpilePackages` in `apps/web/next.config.ts`.
4. Docs: the `packages/temporal` line and the guide link in `AGENTS.md`, `@repo/temporal` in the README's "Then build on the starter", and the mentions in `docs/architecture.md`, `docs/requirements.md`, `docs/i18n.md`, and `docs/verification.md`. Keep the native Temporal checks in `scripts/test-stack.mjs`: they test the Node.js runtime.

Search: `git grep -n -i temporal`.
