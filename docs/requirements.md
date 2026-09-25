# Requirements

## Version policy

Use compatible stable releases, with React 19.x, Next.js 16.x, and Tailwind 4.x. Direct dependencies are pinned and one pnpm lockfile is committed. Node 24.19.0+ within 24.x and pnpm 11.19.0 are the runtime/tooling baseline. Upgrades must pass `pnpm verify` and a frozen-lockfile installation.

TypeScript remains pinned to the verified 6.0.3 baseline; compiler upgrades are separate from linting changes. oRPC packages share stable version 1.15.4; follow the [v1 documentation](https://v1.orpc.dev/docs/getting-started), rather than mixing newer prerelease APIs into this implementation.

## Stack

- React 19.3.0, Next.js 16.3.6 App Router, Turbopack development/production builds, and Cache Components.
- shadcn 4.21.0 with Base UI 1.8.0, Tailwind 4.3.3 CSS-first tokens, and `cn` 0.4.0 for class composition.
- Contract-first oRPC 1.15.4 with ArkType 2.2.5 inputs, outputs, and inferred TypeScript types.
- TanStack Query 5.103.2 for client server data, nuqs 2.10.1 for URL state, and Zustand 5.0.15 for shared local UI state.
- Serwist 9.5.12 for installability, static assets, an offline fallback, and user-controlled updates.
- pnpm workspaces, Turborepo, and strict TypeScript.
- Biome as the sole linter, formatter, and import organizer.
- Husky pre-commit with lint-staged, preserving unstaged changes.
- Vitest for unit/integration checks and Playwright for production browser checks.

## Acceptance

Reproducible installation; passing formatting, linting, type checking, tests, and production builds; compatible Base UI components; runtime API validation; SSR hydration without an immediate duplicate fetch; request isolation; mutation invalidation; navigable URL state; SSR-safe local state; production PWA fallback and updates; restoration of service-worker artifacts from Turbo cache; and hooks that preserve partial staging.

## Development workflow

Biome owns linting, import organization, and formatting, with Tailwind CSS directive parsing enabled. Its opt-in `noTailwindArbitraryValue` rule rejects arbitrary values in application JSX/TSX, including `cn(...)`; generated shared UI components retain their required arbitrary values. This is a nursery rule in the pinned Biome release, so review its behavior during upgrades.

`@shadcn/lint` was removed to keep one linter: it requires an ESLint or Oxlint host and cannot run inside Biome. There is no equivalent configured check for unknown Tailwind utilities, raw palette colors, or dynamically constructed classes. Prefer semantic tokens and complete literal class names; these remaining conventions require code review. See the [plugin's supported hosts](https://github.com/shadcn-ui/lint) and [Biome's arbitrary-value rule](https://biomejs.dev/linter/rules/no-tailwind-arbitrary-value/).

Husky runs Biome safe fixes on staged files through lint-staged. Full checks, unit tests, production browser tests, and build-cache restoration are available separately and through `pnpm verify`. Delivery is organized into local commits for workspace, tooling/hooks, UI, API/state, PWA, and verification/documentation.

## Deferred

Authentication, production persistence/ORM, deployment provider, CI provider, offline data reading/writing, push notifications, and public REST/OpenAPI remain project decisions. Vitest and Playwright are the selected verification tools. The removable example uses an explicitly nonpersistent, public demo repository.
