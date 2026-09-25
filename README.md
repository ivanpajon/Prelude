# Next Template

A pnpm + Turborepo starter with React 19, Next.js 16, Base UI shadcn components, Tailwind 4, contract-first oRPC, ArkType, TanStack Query, nuqs, Zustand, and Serwist.

The included task list connects the stack end to end. **It is public, shared, in-memory demo data:** every visitor reaches the same process-local list, which resets on restart and differs across server instances. Replace it before using the starter for private or persistent data. No database, authentication, or environment variables are required to run the demo.

## Start locally

- Node.js **24.19.0 or later within 24.x**; `.node-version` records the baseline.
- pnpm **11.19.0**, matching `packageManager`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). To run the production build and PWA on a separate origin:

```sh
pnpm build
pnpm start --port 3001
```

Use separate development and production ports. A previously installed production service worker can keep controlling its origin after switching to development; unregister it in browser developer tools if reusing that origin.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js with Turbopack. |
| `pnpm build` | Build Next.js, then generate the Serwist worker. |
| `pnpm start` | Serve an existing production build. |
| `pnpm check` | Check Biome and strict TypeScript. |
| `pnpm fix` | Apply formatting and supported lint fixes. |
| `pnpm test` | Run Vitest API, query, URL-state, and store tests. |
| `pnpm test:e2e` | Build, then run production browser scenarios with Playwright. |
| `pnpm test:cache` | Verify generated worker artifacts restore from Turbo cache. |
| `pnpm verify` | Run the complete verification sequence. |

Install the browser before running browser checks:

```sh
pnpm exec playwright install chromium
pnpm verify
```

Biome is the only linter and formatter. Husky runs its safe fixes through lint-staged before commits. Unresolved errors block the commit; unstaged hunks are preserved. Full-repository checks remain necessary because hooks only inspect staged files. See [verification](docs/verification.md) for scenarios and generated-file handling.

## Make it yours

- Change application metadata and the manifest in `apps/web/src/app`, replace the icons in `apps/web/public/icons`, and customize `packages/ui/src/styles/globals.css`.
- Add components with the pinned CLI from the workspace root: `pnpm --filter @repo/ui exec shadcn add dialog`. The UI package's `base-nova` configuration selects Base UI and writes shared components there.
- Import components from `@repo/ui/components/*` and `cn` from `@repo/ui/lib/utils`; the latter re-exports the `cn` package.
- Replace the task contracts, repository, and workbench with your feature, updating the corresponding tests. Keep the provider and transport infrastructure you need.

See [architecture](docs/architecture.md) for data access, state, caching, and removing the demo; [requirements](docs/requirements.md) records the stack and deferred choices.
