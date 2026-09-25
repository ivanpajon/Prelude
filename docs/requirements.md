# Requirements

## Version policy

Use compatible stable releases, with React 19.x, Next.js 16.x, and Tailwind 4.x. Direct dependencies are pinned and one pnpm lockfile is committed. Node 24.19.0+ within 24.x and pnpm 11.19.0 are the runtime/tooling baseline. Upgrades must pass `pnpm verify` and a frozen-lockfile installation.

TypeScript 6.0.3 satisfies the selected ESLint parser's `>=4.8.4 <6.1.0` peer range; TypeScript 7 is deferred until that integration supports it. oRPC packages share stable version 1.15.4; follow the [v1 documentation](https://v1.orpc.dev/docs/getting-started), rather than mixing newer prerelease APIs into this implementation.

## Stack

- React 19.3.0, Next.js 16.3.6 App Router, Turbopack development/production builds, and Cache Components.
- shadcn 4.21.0 with Base UI 1.8.0, Tailwind 4.3.3 CSS-first tokens, and `cn` 0.4.0 for class composition.
- Contract-first oRPC 1.15.4 with ArkType 2.2.5 inputs, outputs, and inferred TypeScript types.
- TanStack Query 5.103.2 for client server data, nuqs 2.10.1 for URL state, and Zustand 5.0.15 for shared local UI state.
- Serwist 9.5.12 for installability, static assets, an offline fallback, and user-controlled updates.
- pnpm workspaces, Turborepo, and strict TypeScript.
- Biome for general linting/formatting; `@shadcn/lint` through dedicated ESLint configuration.
- Husky pre-commit with lint-staged, preserving unstaged changes.
- Vitest for unit/integration checks and Playwright for production browser checks.

## Acceptance

Reproducible installation; passing formatting, linting, type checking, tests, and production builds; compatible Base UI components; runtime API validation; SSR hydration without an immediate duplicate fetch; request isolation; mutation invalidation; navigable URL state; SSR-safe local state; production PWA fallback and updates; restoration of service-worker artifacts from Turbo cache; and hooks that preserve partial staging.

## Development workflow

Biome owns general linting, import organization, and formatting. Dedicated ESLint rules validate Tailwind classes throughout the app/UI package and require theme colors, token-based values, and statically readable classes in app components. Generated UI implementations retain their legitimate variant functions and arbitrary values.

Husky runs Biome safe fixes and Tailwind lint on staged files through lint-staged. Full checks, unit tests, production browser tests, and build-cache restoration are available separately and through `pnpm verify`. Delivery is organized into local commits for workspace, tooling/hooks, UI, API/state, PWA, and verification/documentation.

## Deferred

Authentication, production persistence/ORM, deployment provider, CI provider, offline data reading/writing, push notifications, and public REST/OpenAPI remain project decisions. Vitest and Playwright are the selected verification tools. The removable example uses an explicitly nonpersistent, public demo repository.
