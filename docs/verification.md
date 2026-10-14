# Verification

Run the checks from the workspace root with the pinned Node and pnpm versions. Install the browser once before the browser suites:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

## Checks and scenarios

Times are rough figures from a Windows workstation; cold caches and CI runners take longer.

| Command | Coverage | Time |
| --- | --- | --- |
| `pnpm check` | Biome, strict TypeScript, and compile-only negative contract checks. | under 1 min |
| `pnpm test` | RPC/REST validation and procedure behavior, generated OpenAPI schemas and MCP tools, request isolation, Temporal behavior, Testing Library component scenarios, and the repository scripts. | 15–30 s |
| `pnpm test:coverage` | The same suite with V8 coverage reports in `coverage/`. | 15–30 s |
| `pnpm test:ui` | Local Vitest watch UI on `127.0.0.1`; exit with Ctrl+C. | |
| `pnpm test:dev` | Fresh Turbopack development server, initial rendering, interactions, the embedded MCP Inspector, and reloads without console/overlay errors. | 1–3 min |
| `pnpm build` | Production Turbopack compilation, Cache Components rendering, and Serwist generation. | 1 min |
| `pnpm test:e2e` | Build, then check production hydration, security headers, Scalar docs and requests, MCP protocol access, offline fallback, and worker updates. | 2–4 min |
| `pnpm test:cache` | Build, remove only known generated artifacts such as the service worker, then confirm a Turbo cache hit restores identical bytes. | 30 s |
| `pnpm verify` | `check`, `test:coverage`, `test:dev`, `test:e2e`, and `test:cache`, in that order. | 4–10 min |
| `pnpm test:stack` | The Docker production and development stacks; see [Docker stacks](#docker-stacks). | 5–15 min |
| `pnpm test:stack --part <name>` | One part of `pnpm test:stack`: `builds`, `runtime`, `development`, or `rebuild`. | 2–3 min |
| `pnpm test:stack:quick` | Only the production stack: one cold build, one runtime sample, and its browser checks. | 2 min |

`pnpm test:e2e` builds automatically and starts its own production server at `http://127.0.0.1:3100`; leave that port free. Desktop and mobile app scenarios block service workers to isolate UI behavior, while the PWA project allows them. The tests detect hydration errors. Reports, traces, and failure screenshots go to ignored test output directories.

<!-- demo:start -->
The demo also builds its MCP App before Next.js. Its browser scenarios verify initial data without an immediate duplicate RPC fetch, create/edit/complete/delete tasks, navigate filters with history, check failed-request recovery, and verify compact view stays local to its browser context.
<!-- demo:end -->

`pnpm test:dev` starts its own development server at `http://127.0.0.1:3102`, with the Inspector on 6284 and its sandbox on 6286. Stop ordinary `pnpm dev` first because both use the application's development output directory and lock. The smoke test captures all console errors and uncaught exceptions, exercises both animation previews, reloads, and checks Next.js's issues overlay. `pnpm verify` runs this check before building production; development-only validation errors can pass a production build.

Scalar scenarios verify the homepage link at 320px and the exact pinned CDN renderer. The rendering test rejects unexpected external requests; the pinned jsDelivr bundle is the only allowed external resource. These browser checks require access to that CDN. HTTP and schema tests run locally without it.

<!-- demo:start -->
The demo's Scalar scenarios also cover search and hash navigation, and send real same-origin GET, POST, PATCH, and DELETE requests; a task created in Scalar must appear in the server-rendered workbench and subsequent RPC queries.
<!-- demo:end -->

PWA scenarios inspect the manifest/icons, wait for a controlling worker, test a new navigation offline, and confirm RPC, REST, docs, specification, and RSC responses are absent from Cache Storage. Docs/spec/REST fetches must fail offline instead of returning cached responses.

Update scenarios change only the generated worker and explicitly call `registration.update()` to trigger a deterministic browser check; production code uses the browser's default timing without polling. They cover a quiet first installation, a waiting worker that stays inactive before approval, keyboard activation at desktop and 320px widths, reduced motion at 320px, one reload per approval, and pointer-swipe dismissal followed by notification for a newer worker. Both width checks save an `update-toast.png` screenshot in their test output directories. Two-tab scenarios leave unsaved state in the second tab (such as a saved animation idea): approval in the first tab activates the worker, while the second tab keeps its state until its own **Reload now** action. Each test restores the original worker in cleanup. These scenarios share one production worker file and run serially; do not run another build or worker-update suite concurrently.

The cache check saves the generated files listed in `scripts/verify-build-cache.mjs`, such as `apps/web/public/sw.js` and its map when present, removes only those explicit generated files, checks the restored hashes after a Turbo cache hit, and in `finally` writes the saved bytes back only for files that are still missing. Do not run it alongside a development/production server or another build. Source files, the lockfile, and directories are not its cleanup targets.

<!-- demo:start -->
## MCP App acceptance

The current browser workbench and JSON tool explorer live at `/playground`; Motion/Morphicons remain on `/`. Browser acceptance must cover navigation between the two pages, playground server rendering and hydration, task URL/history behavior, JSON tool execution, and the development-only Inspector link.

The MCP App adds protocol checks for UI metadata, HTML resource discovery/read, generated name changes, exclusions, unchanged modern/legacy JSON output, and masked asset failures. Widget tests cover result decoding, host input/result handling, query isolation, mutations/filter refresh, cancellation, and connection cleanup. Build tests check self-contained output and atomic replacement. `pnpm test:cache` restores both generated HTML and worker artifacts byte for byte.

The real preview requires Inspector's **Apps** interface: connect, select **List tasks** (`listTasks`), supply `status`, and choose **Open App**. Native and Docker development checks must exercise that sandboxed widget, including its controls and asset rebuild/reopen behavior; raw Tools calls alone do not verify rendering. Production must serve the resource from the built standalone artifact while Inspector paths remain absent. See [MCP Apps](mcp-apps.md) for port and CSP boundaries.
<!-- demo:end -->

## Test environments and coverage

Infrastructure tests use only shared pages and endpoints, plus the test-only notes API in `apps/web/src/testing/fixture-api.ts`. Playwright projects match spec file names in any folder, so a new spec joins the project of the infrastructure spec with the same name. A spec in `tests/e2e` with a new file name runs only once it is registered: add it to `browserSpecs` (or a project's `testMatch`) in `playwright.config.ts`. `tests/dev` runs every spec in it, and the stack suite runs only `production.spec.ts` and `development.spec.ts` (`playwright.stack.config.ts`).

<!-- demo:start -->
Task demo tests live in `*.tasks.test.ts` files and in `tests/e2e/demo/`, `tests/dev/demo/`, and `tests/stack/demo/`, with their helpers in `tests/demo/`. Removing the demo removes those files, and the infrastructure suites still run.
<!-- demo:end -->

Vitest's `node` project discovers `.test.ts` files under applications and packages. Its `dom` project discovers `.test.tsx` files and supplies jsdom, Testing Library cleanup, and jest-dom matchers. The DOM setup stubs `matchMedia`; use Playwright for real layout, hydration, service workers, and browser preferences. Keep asynchronous Server Component tests in Playwright.

Open the URL printed by `pnpm test:ui`, including its authentication token, to use the test explorer. The command stays in watch mode and binds its API to loopback.

`pnpm verify` runs coverage rather than running the unit suite twice. Coverage includes all `.ts` and `.tsx` source under `apps/*/src` and `packages/*/src`, including untested files. New applications, packages, and source files enter the report automatically. Tests, declaration files, test-only `src/testing` fixtures, and the compile-only `contract-types.ts` fixture are excluded.

Next.js pages, service-worker code, and shared UI components are included in that source inventory. Playwright checks integrated rendering and browser behavior separately; its execution does not contribute to Vitest coverage. Reports start without percentage gates so projects can set meaningful thresholds for their own code. Vitest, its UI, and its coverage provider are pinned to the same version.

## Docker stacks

Run `pnpm test:stack` with Docker's Linux engine running and host dependencies installed. This separate acceptance command verifies the packaged production runtime and development workflow; `pnpm verify` continues to run natively without requiring Docker. See [Docker verification and measurements](docker.md#verification-and-measurements) for scope and prerequisites.

`pnpm test:stack` runs four parts in this order. Each part also runs alone with `--part`, for example `pnpm test:stack --part development`. It then makes its own disposable copy, Compose projects, and images, and cleans them up, so CI runs the parts as parallel jobs.

| Part | What it checks |
| --- | --- |
| `builds` | Cold, unchanged, source-change, and restore builds of the production image on an empty builder, with the cache hits each one must show, and the image sizes. |
| `runtime` | One production build, its runtime facts (non-root user, Intl, Temporal, sharp, no build tools, writable cache), three runtime samples (`--samples` changes the count), the production browser checks in the first sample, and the MCP toggle without a rebuild. |
| `development` | The development image, Compose Watch, and the development browser checks in `tests/stack`. `--shard 1/2` and `--shard 2/2` each run half of those checks; their report records the shard as `developmentBrowserShard` instead of each development check. |
| `rebuild` | The development image and Compose Watch, then a `package.json` change that must rebuild and replace the container, and a restart with `MCP_ENABLED=false`. |

The parts that edit the disposable copy (`builds`, `development`, and `rebuild`) also check that the checkout's source files did not change. The development image builds in the selected Buildx builder, by default the Docker engine's own one, which `docker compose watch` also uses; see [Docker verification and measurements](docker.md#verification-and-measurements).

`pnpm test:stack:quick` (`pnpm test:stack --quick`) is the `runtime` part with one sample, the short version that CI runs on every pull request. It builds the production image once, checks its runtime facts, starts one sample with the production browser checks, and toggles MCP without a rebuild.

The run report is written to ignored `test-results/stack/report.json`. Inspect its completed checks, image-size measurements, timings, and platform information before reporting Docker acceptance. Results from native tests or an image build alone do not establish that the standalone runtime, service worker, MCP transports, or Compose Watch work in a container.

## Reading the results

| Output | Contents |
| --- | --- |
| `coverage/` | V8 coverage from `pnpm test:coverage`: open `coverage/index.html`. |
| `playwright-report/` | HTML report of the last `pnpm test:e2e` run: `pnpm exec playwright show-report`. |
| `test-results/production/`, `test-results/development/` | Traces and screenshots of failed browser cases, plus saved screenshots such as `update-toast.png` and `mcp-inspector.png`. Open a trace with `pnpm exec playwright show-trace <path>/trace.zip`. |
| `test-results/stack/` | `report.json` from `pnpm test:stack`, with the parts it ran, and the container browser output. |

All of these are ignored by Git. A new run replaces the previous output.

## Continuous integration

GitHub Actions runs two workflows. Both use Ubuntu, the Node version in `.node-version`, the pinned pnpm from `packageManager`, and `HUSKY=0`, through the shared setup action in `.github/actions/setup`. A newer push to the same branch or pull request cancels the older run.

**CI** (`.github/workflows/ci.yml`) is the fast lane. It runs on pull requests, pushes to `main` or `develop`, manual dispatch, and a weekly schedule (Monday 06:00 UTC). Its jobs run in parallel, and each takes about 2 minutes:

| Job | What it runs |
| --- | --- |
| **Audit** | `pnpm audit --prod --audit-level high`. The weekly run only audits. |
| **Check** | `pnpm check` and `pnpm test:coverage`. |
| **E2E (1/4)** to **E2E (4/4)** | `pnpm build`, then a quarter of the production browser tests with `playwright test --shard`. The first shard also runs `pnpm test:cache`. |
| **Dev (1/2)** and **Dev (2/2)** | Half of `pnpm test:dev` each. |
| **Docker smoke** | `pnpm test:stack:quick`. |

Together, Check, E2E, and Dev run everything in `pnpm verify`. Each shard starts its own server and runs its tests one at a time, like the local commands, because the tests of a suite share one server. Playwright splits shards by whole spec files, so a shard can end up slow or empty after you add or move many tests. To see the split, run `pnpm exec playwright test --list --shard=1/4` (add `--config playwright.dev.config.ts` for the development suite), and change the shard list in `ci.yml` if needed.

The **Audit** job fails on high or critical advisories in production dependencies; run the same command locally. When it fails on an advisory with no fix and you have checked that it does not affect you, add the GHSA ID to `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with a comment saying why, and remove it when a fix ships. The braces entry there is an example. Do not use `pnpm audit --ignore-unfixable`: pnpm 12 writes every advisory without a fix into that list, without a reason.

**Docker** (`.github/workflows/docker.yml`) is the full lane. Its **Docker stack** jobs run the parts of `pnpm test:stack` in parallel, in about 2–3 minutes each: **Docker stack (builds)**, **Docker stack (runtime)**, **Docker stack (development 1/2)**, **Docker stack (development 2/2)**, and **Docker stack (rebuild)**. The development browser checks are split by single tests, so both halves keep tests after `pnpm remove-demo` too; to see the split, run `pnpm exec playwright test --config playwright.stack.config.ts --list --fully-parallel --shard=1/2` with `PRELUDE_STACK_MODE=development` and any `PRELUDE_STACK_URL` set. Nobody waits for the Docker lane on an ordinary pull request. It runs on pushes to `main` or `develop`, the weekly schedule, manual dispatch, and pull requests that change how the images or the development stack are built: the Dockerfile, `.dockerignore`, the Compose files, `.node-version`, the lockfile, `pnpm-workspace.yaml`, any `package.json` or `tsconfig*.json`, the Next.js and PostCSS configuration, the development launcher, the stack test and its specs, the source files that the stack test edits to check rebuild caching and live reload, the setup action, or the workflow itself. The full list is the `paths` filter in `docker.yml`; extend it when you add a file that changes the images.

The setup action caches Playwright's browsers by runner system and Playwright version, and installs only Chromium's headless shell, which the headless tests use. It installs Chromium's system libraries only when the runner image lacks some. For the Docker jobs it also installs a pinned Docker Compose release and checks its SHA-256, because the runner's plugin is older than the minimum in [Docker workflows](docker.md); update the version and checksum together. Failed browser jobs upload Playwright traces, screenshots, and the HTML report, one artifact per shard; every **Docker stack** job and the **Docker smoke** job always upload their stack report. Actions are pinned to commit SHAs with the release in a comment; update both together.

<!-- demo:start -->
Two kinds of jobs prove that a project without the demo stays green. **Demo removal (quick)** in CI runs `pnpm remove-demo` in a fresh checkout, which installs, formats, checks, and tests the result, and then `pnpm build`. It does not run the browser tests, to keep CI near 2 minutes. **Demo removal** in the Docker workflow runs as six parallel jobs. Each one runs `pnpm remove-demo`, which also checks and unit-tests the result, and then one slice: **Demo removal (e2e)** runs `pnpm test:e2e` and `pnpm test:cache`, **Demo removal (dev)** runs `pnpm test:dev`, and **Demo removal (stack builds)**, **(stack runtime)**, **(stack development)**, and **(stack rebuild)** each run one part of `pnpm test:stack`. Together they cover `pnpm verify` and `pnpm test:stack`. Without the demo, the development browser checks are short, so one job runs all of them. A failed job uploads its test results. The jobs run on the same triggers as the Docker stack jobs, and also on pull requests that change the browser tests or their Playwright configuration. A pull request that changes only application code can still break the browser tests without the demo; the push run of **Demo removal** then catches it. `pnpm remove-demo` deletes all of these jobs and this paragraph.
<!-- demo:end -->

## Commit hooks

The `pre-commit` hook runs Biome's safe fixes on staged files through lint-staged. The `commit-msg` hook runs Commitlint with `@commitlint/config-conventional`. Use messages such as `feat: add task filters`, `fix(api): validate titles`, or `chore: update dependencies`. To check existing messages, run `pnpm commitlint --from HEAD~1 --to HEAD --verbose`. Hooks only see staged files, so run `pnpm check` and `pnpm test` before committing as well.

Lint errors block the commit, and unstaged changes survive formatting. To check that safely, use a disposable branch or temporary fixture, stage one hunk, change another without staging, and run `pnpm lint:staged`. Inspect both `git diff --cached` and `git diff` before committing.

## Recovery

- **A suite cannot start its server.** Free the ports above (3100 for production, 3102, 6284 and 6286 for development) and stop `pnpm dev`, which shares the development output directory.
- **An interrupted worker-update or cache run.** Regenerate the artifacts with `pnpm build --force` before retrying.
- **Development reports that `PlaceValidationBoundaryBelowThisLevel` is missing from the React Client Manifest.** This is stale development bundler state, usually after dependency or Node changes, not a missing component. Stop the development server before package/runtime upgrades, verify the shell's `node --version`, complete `pnpm install --frozen-lockfile`, start `pnpm dev`, and reload the browser. Runtime version files do not change existing processes. If a restart alone does not recover generated state, stop the server and remove only `apps/web/.next/dev` before retrying. Do not disable instant validation or Cache Components to hide an unexplained error. Next.js's [instant validation reference](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant) explains why these checks run in development; [React Doctor](diagnostics.md) complements it but does not replace it.

Dated results of the template's own runs are in [verification history](verification-history.md).
