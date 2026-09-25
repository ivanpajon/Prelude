# Requirements

## Version policy

Use the latest compatible stable releases when scaffolding, with React 19.x, Next.js 16.x, and Tailwind 4.x. Pin dependency versions and commit the pnpm lockfile. Node 24 is the runtime baseline. TypeScript 6.0.3 is the newest stable release supported by the selected TypeScript ESLint parser; TypeScript 7 is intentionally deferred until its peer range supports it.

## Stack

- React 19, Next.js 16 App Router, Turbopack development and production builds, and Cache Components.
- shadcn/ui with Base UI primitives, Tailwind 4 CSS-first tokens, and the `cn` package for class composition.
- Contract-first oRPC with ArkType inputs, outputs, and inferred TypeScript types.
- TanStack Query for client server data, nuqs for URL state, and Zustand for shared local UI state.
- Serwist for installability, static assets, an offline fallback, and user-controlled service-worker updates.
- pnpm workspaces, Turborepo, and strict TypeScript.
- Biome for general linting/formatting; `@shadcn/lint` through dedicated ESLint configuration.
- Husky pre-commit with lint-staged, preserving unstaged changes.
- Vitest for unit/integration checks and Playwright for production browser checks.

## Acceptance

Reproducible installation; passing formatting, linting, type checking, tests, and production builds; compatible Base UI components; runtime API validation; SSR hydration without an immediate duplicate fetch; request isolation; mutation invalidation; navigable URL state; SSR-safe local state; production PWA fallback and updates; restoration of service-worker artifacts from Turbo cache; and hooks that preserve partial staging.

## Delivery

Six local commits on the existing `develop` branch: workspace; quality tools/hooks; application/UI; API/state; PWA; integrated verification/documentation. Validate each batch before committing.

## Deferred

Authentication, production persistence/ORM, deployment, a CI provider, offline data reading/writing, push notifications, and public REST/OpenAPI. The removable example uses an explicitly nonpersistent demo repository.
