# Prelude

<p align="center">
  <img src="docs/assets/prelude-logo.png" alt="Prelude" width="640" />
</p>

A pnpm + Turborepo starter with React 19, Next.js 16, Base UI shadcn components, Tailwind 4, contract-first oRPC, ArkType, automatically generated OpenAPI docs with Scalar and native MCP tools, TanStack Query, nuqs, Zustand, and Serwist.

The included task list connects the stack end to end. **It is public, shared, in-memory demo data:** every visitor reaches the same process-local list, which resets on restart and differs across server instances. Replace it before using the starter for private or persistent data. No database, authentication, or environment variables are required to run the demo.

## Start locally

- Node.js **26.10.0 or later within 26.x**; `.node-version` records the baseline.
- pnpm **12.6.0**, matching `packageManager`.

Create a new project from the public template:

```sh
pnpm dlx create-next-app@16.3.6 my-app --example https://github.com/ivanpajon/Prelude --use-pnpm --skip-install --yes
cd my-app
pnpm install --frozen-lockfile
pnpm dev
```

Use `--skip-install` for this monorepo: Next.js lives in `apps/web`, while create-next-app's automatic type generation expects it at the root. Installing afterward also lets Husky configure hooks after Git initialization. The generated project starts with new Git history and no remote. Use `pnpm customize` below to change package names; customize application branding separately.

For an existing checkout:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Check `node --version` in the shell that starts development; `.node-version` does not switch an already running shell or server. Installation enforces the Node 26 engine range. Stop development before changing dependencies, finish the installation, and then restart it.

Open [localhost:3000](http://localhost:3000), then follow **API docs** to [the Scalar reference](http://localhost:3000/api/docs). The [OpenAPI specification](http://localhost:3000/api/openapi.json) is generated from the contracts on request; no generation command is needed. Scalar loads its version-pinned renderer from jsDelivr, so the interactive reference requires CDN access. See [OpenAPI usage](docs/openapi.md) for endpoints, adding procedures, and upgrades.

The same contracts provide native MCP tools at `/api/mcp`. Try the **MCP playground** on the homepage: discover tools, edit JSON arguments, and execute real calls that refresh the task list. `pnpm dev` also starts an authenticated local MCP Inspector, embedded at [the development Inspector page](http://localhost:3000/api/mcp/inspector). Run `pnpm mcp:check` from another terminal to check the endpoint with its CLI. MCP is public and enabled by default; set `MCP_ENABLED=false` to disable it and the playground. See [MCP usage](docs/mcp.md) for client connection, origin configuration, and replacing the demo safely.

To run the production build and PWA on a separate origin:

```sh
pnpm build
pnpm start --port 3001
```

Use separate development and production ports. A previously installed production service worker can keep controlling its origin after switching to development; unregister it in browser developer tools if reusing that origin.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm customize --name my-app --scope "@acme"` | Rename the root package and workspace scope, reinstall, and validate. |
| `pnpm dev` | Start Next.js with Turbopack and the managed local MCP Inspector. |
| `pnpm mcp:check` | Check the running MCP endpoint with the pinned Inspector CLI; supports `--url`. |
| `pnpm build` | Build Next.js, then generate the Serwist worker. |
| `pnpm start` | Serve an existing production build. |
| `pnpm check` | Check Biome and strict TypeScript. |
| `pnpm fix` | Apply formatting and supported lint fixes. |
| `pnpm test` | Run Vitest server/utility tests and Testing Library component tests. |
| `pnpm test:coverage` | Run tests with V8 coverage and HTML/LCOV reports. |
| `pnpm test:ui` | Open Vitest's local test explorer in watch mode. |
| `pnpm test:dev` | Check development rendering and the embedded MCP Inspector. |
| `pnpm test:e2e` | Build, then run production browser and MCP protocol scenarios with Playwright. |
| `pnpm test:cache` | Verify generated worker artifacts restore from Turbo cache. |
| `pnpm verify` | Run the complete verification sequence. |
| `pnpm react-doctor` | Run optional React diagnostics with file locations. |
| `pnpm --silent react-doctor:json` | Print a structured diagnostic report for agents. |

Install the browser before running browser checks:

```sh
pnpm exec playwright install chromium
pnpm verify
```

Biome handles source linting and formatting. Husky runs its safe fixes through lint-staged before commits. Commitlint checks Conventional Commit messages in the separate `commit-msg` hook, such as `feat: add profile settings` or `fix(api): reject invalid input`. Unresolved errors block the commit; unstaged hunks are preserved. Full-repository checks remain necessary because hooks only inspect staged files. See [verification](docs/verification.md) for scenarios and generated-file handling.

## Make it yours

Keep the default `@repo` workspace scope, or optionally choose your own:

```sh
# Change only the root package name; keep @repo.
pnpm customize --name my-app

# Preview a scope change, then apply it.
pnpm customize --name my-app --scope "@acme" --dry-run
pnpm customize --name my-app --scope "@acme"
```

The command updates package names, workspace dependencies, imports, shadcn aliases, TypeScript paths, framework/tool configuration, and documentation references. It regenerates the lockfile, refreshes workspace links, formats changed source/configuration files, and runs `pnpm check` and `pnpm test`. Omitted options preserve the current value. See [customization](docs/customization.md) for requirements, reruns, and recovery.

- Change application metadata and the manifest in `apps/web/src/app`, replace the icons in `apps/web/public/icons`, and customize `packages/ui/src/styles/globals.css`.
- Replace the transparent web logo in `apps/web/public/branding` and the README banner in `docs/assets` with your own branding.
- Add components with the pinned CLI from the workspace root: `pnpm --filter @repo/ui exec shadcn add dialog`. The UI package's `base-nova` configuration selects Base UI and writes shared components there.
- Import components from `@repo/ui/components/*` and `cn` from `@repo/ui/lib/utils`; the latter re-exports the `cn` package.
- Import dates and times from `@repo/temporal`; it selects native Temporal or a browser-compatible fallback. See [Temporal usage](docs/temporal.md) for serialization and hydration guidance.
- Use the shared Motion provider and Morphicons wrapper for animations that honor reduced motion. The compact-view toggle demonstrates both; see [animation guidance](docs/motion.md).
- Replace the task contracts, repository, and workbench with your feature, updating the corresponding tests. Keep the provider and transport infrastructure you need.
- Update the API title, version, tags, and descriptions in `apps/web/src/lib/openapi.ts`; keep route metadata with the contracts. See [OpenAPI customization and demo removal](docs/openapi.md).
- MCP tools follow the same OpenAPI operations automatically. Configure exposure and request authorization with the rest of the API; see [MCP customization](docs/mcp.md).

See [architecture](docs/architecture.md) for data access, state, caching, and removing the demo; [requirements](docs/requirements.md) records the stack and deferred choices. [React diagnostics](docs/diagnostics.md) explains scanner results and scoped exceptions. [Candidate skills](docs/skills.md) lists reviewed project-local agent skills and installation commands; none are installed by default.
