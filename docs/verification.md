# Verification

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
| `pnpm test` | API validation and procedure behavior, request/query/store isolation, URL parsing, native and fallback Temporal behavior, and Testing Library component scenarios. |
| `pnpm test:coverage` | The same suite with V8 coverage reports in `coverage/`. |
| `pnpm test:ui` | Local Vitest watch UI on `127.0.0.1`; exit with Ctrl+C. |
| `pnpm test:dev` | Fresh Turbopack development server, initial rendering, interactions, and reloads without console/overlay errors. |
| `pnpm build` | Production Turbopack compilation, Cache Components rendering, and Serwist generation. |
| `pnpm test:e2e` | Build, then check production hydration, mutations, URL navigation, local state, offline fallback, and worker updates. |
| `pnpm test:cache` | Build, remove only generated worker artifacts, then confirm a Turbo cache hit restores identical bytes. |

`pnpm test:e2e` builds automatically and starts its own production server at `http://127.0.0.1:3100`; leave that port free. Desktop and mobile app scenarios block service workers to isolate UI behavior, while the PWA project allows them. The tests detect hydration errors, verify initial data without an immediate duplicate RPC fetch, create/complete tasks, navigate filters with history, check failed-request recovery, and verify compact view stays local to its browser context. Reports, traces, and failure screenshots go to ignored test output directories.

`pnpm test:dev` starts its own development server at `http://127.0.0.1:3102`. Stop ordinary `pnpm dev` first because both use the application's development output directory and lock. The smoke test captures all console errors and uncaught exceptions, exercises both animation previews, reloads, and checks Next.js's issues overlay. `pnpm verify` runs this check before building production; development-only validation errors can pass a production build.

PWA scenarios inspect the manifest/icons, wait for a controlling worker, test a new navigation offline, and confirm RPC/RSC responses are absent from Cache Storage. The update scenario changes only the generated worker, verifies the waiting notice, and activates it through **Reload to update**. It restores the original worker in cleanup. If a run is forcibly interrupted, regenerate artifacts with `pnpm build --force` before retrying.

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

`pnpm verify` runs coverage rather than running the unit suite twice. Coverage is collected for contracts, API/repository logic, Temporal, state helpers, and the shared animation wrappers. Generated shadcn components and complete Next.js pages are not coverage targets; the form-controls tests exercise component composition, while Playwright owns integrated rendering. Reports start without percentage gates so projects can set meaningful thresholds for their own code. Vitest, its UI, and its coverage provider are pinned to the same version.

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
