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
| `pnpm test` | API input/output validation, title normalization, missing records, isolated request context/repositories, invalidation callback, query isolation, URL parsing, and independent Zustand stores. |
| `pnpm test:coverage` | The same suite plus Temporal and Testing Library component scenarios, with V8 coverage reports in `coverage/`. |
| `pnpm test:ui` | Local Vitest watch UI on `127.0.0.1`; exit with Ctrl+C. |
| `pnpm build` | Production Turbopack compilation, Cache Components rendering, and Serwist generation. |
| `pnpm test:e2e` | Build, then check production hydration, mutations, URL navigation, local state, offline fallback, and worker updates. |
| `pnpm test:cache` | Build, remove only generated worker artifacts, then confirm a Turbo cache hit restores identical bytes. |

`pnpm test:e2e` builds automatically and starts its own production server at `http://127.0.0.1:3100`; leave that port free. Desktop and mobile app scenarios block service workers to isolate UI behavior, while the PWA project allows them. The tests detect hydration errors, verify initial data without an immediate duplicate RPC fetch, create/complete tasks, navigate filters with history, check failed-request recovery, and verify compact view stays local to its browser context. Reports, traces, and failure screenshots go to ignored test output directories.

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

`pnpm verify` runs coverage rather than running the unit suite twice. Coverage is collected for contracts, API/repository logic, Temporal, state helpers, and the shared animation wrappers. Generated shadcn components and complete Next.js pages are not coverage targets; the form-controls tests exercise component composition, while Playwright owns integrated rendering. Reports start without percentage gates so projects can set meaningful thresholds for their own code. Vitest, its UI, and its coverage provider are pinned to the same version.
