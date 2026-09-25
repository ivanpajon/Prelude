# Next Template

A pnpm + Turborepo starter for React 19 and Next.js 16. Requirements and architecture are recorded in [docs/requirements.md](docs/requirements.md).

## Prerequisites

- Node.js 24.19 or later in the Node 24 release line (`.node-version`).
- pnpm 11.19.0, matching the root `packageManager` field.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
```

The workspace uses private TypeScript source packages consumed by the web application. See [docs/architecture.md](docs/architecture.md) for package boundaries.
