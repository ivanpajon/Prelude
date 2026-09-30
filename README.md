# Prelude

<p align="center">
  <img src="docs/assets/prelude-logo.png" alt="Prelude" width="640" />
</p>

**A next-generation, agentic-ready Next.js template.**

Prelude gives developers and AI agents a shared foundation: a modern web application, typed APIs, discoverable tools, and interactive MCP Apps. Less setup. More building.

- **One contract across interfaces.** Define schemas and operations once with oRPC and ArkType. Reuse them through RPC, REST, automatically generated OpenAPI documentation with Scalar, and native MCP tools.
- **Interactive examples included.** Explore the task workspace and live MCP tool runner at `/playground`, or use the task-list MCP App inside a compatible host.
- **Inspect as you build.** The managed local MCP Inspector lets you discover tools, inspect schemas, execute calls, and preview the MCP App. Check connectivity from the terminal with `pnpm mcp:check`.
- **Feedback for humans and agents.** Strict TypeScript, Biome, Vitest, Testing Library, Playwright, and React Doctor provide checks and diagnostics, including structured React reports for agents.
- **Two languages from the start.** English and Spanish cover the website, PWA feedback, and MCP App, with browser detection and a saved language choice on stable public URLs.

The pnpm + Turborepo workspace brings together React 19, Next.js 16 with Turbopack and Cache Components, Base UI shadcn components, Tailwind 4, TanStack Query, nuqs, Zustand, and Serwist. Keep your choice of database, authentication, AI provider, and deployment platform; no provider account or model API key is required to run the examples. Connect your preferred agent explicitly through MCP.

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

Choose **Open playground** for [the task workspace and MCP explorer](http://localhost:3000/playground). Create tasks, try URL filters and compact view, then discover the generated MCP tools, edit JSON arguments, and execute real calls that refresh the same list. Motion and Morphicons previews stay on the homepage.

Choose **English / Español** in the header to change language; your browser preference supplies the initial choice. `/` and `/playground` keep the same URLs in both languages. The MCP App follows its host's language, with a browser/English fallback. Task titles, protocol output, and the third-party Scalar/Inspector interfaces retain their original content. See [localization](docs/i18n.md) for catalogs, adding a language, and offline behavior.

The task example supports listing, creating, editing titles, completing, and deleting through the workbench, REST, and MCP. Use a row's pencil button to edit its title; **Enter** saves and **Escape** cancels. Titles are trimmed before validating their 1–120-character length, completion is preserved, and failed saves retain the edit and new-task drafts. Deletion returns the removed task; missing IDs return `NOT_FOUND`.

The same contracts provide native MCP tools at `/api/mcp`. A compatible host can render the task widget associated with `listTasks`, using the official MCP Apps SDK. `pnpm dev` builds the widget and starts an authenticated local MCP Inspector, available through **Open Inspector** on the playground. Use Inspector's **Apps** interface to preview it; the website itself is not an MCP Apps host. Run `pnpm mcp:check` from another terminal for a CLI connectivity check. MCP is public and enabled by default; `MCP_ENABLED=false` disables its tools, resources, and JSON explorer actions. See [MCP usage](docs/mcp.md) and [the MCP App guide](docs/mcp-apps.md) for connections, sandbox ports, builds, and example removal.

To run the production build and PWA on a separate origin:

```sh
pnpm build
pnpm start --port 3001
```

Use separate development and production ports. A previously installed production service worker can keep controlling its origin after switching to development; unregister it in browser developer tools if reusing that origin.

## Run with Docker

With Docker running, start the production application at [localhost:3001](http://localhost:3001):

```sh
pnpm stack:prod
```

Production is the default Compose configuration. For development with Turbopack, automatic source synchronization, and the managed MCP Inspector:

```sh
pnpm stack:dev
```

Development uses [localhost:3000](http://localhost:3000). Both workflows build their own Linux dependencies; host `node_modules` and Next.js output stay separate. Configuration is optional. See [Docker workflows](docs/docker.md) for prerequisites, custom ports, environment variables, shutdown, server deployment, and verification.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm customize --name my-app --scope "@acme"` | Rename the root package and workspace scope, reinstall, and validate. |
| `pnpm dev` | Build/watch the MCP App, then start Next.js with Turbopack and the managed local MCP Inspector. |
| `pnpm mcp:check` | Check the running MCP endpoint with the pinned Inspector CLI; supports `--url`. |
| `pnpm build` | Build the MCP App, build Next.js, then generate the Serwist worker. |
| `pnpm start` | Serve an existing production build. |
| `pnpm stack:prod` | Build and start the production Docker Compose stack. |
| `pnpm stack:dev` | Start the development Docker Compose stack with Watch and MCP Inspector. |
| `pnpm test:stack` | Verify the Docker stacks and report image/build/runtime measurements. |
| `pnpm check` | Check Biome and strict TypeScript. |
| `pnpm fix` | Apply formatting and supported lint fixes. |
| `pnpm test` | Run Vitest server/utility tests and Testing Library component tests. |
| `pnpm test:coverage` | Run tests with V8 coverage and HTML/LCOV reports. |
| `pnpm test:ui` | Open Vitest's local test explorer in watch mode. |
| `pnpm test:dev` | Check development rendering and the embedded MCP Inspector. |
| `pnpm test:e2e` | Build, then run production browser and MCP protocol scenarios with Playwright. |
| `pnpm test:cache` | Verify generated MCP App and worker artifacts restore from Turbo cache. |
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

- Change translated branding/metadata in `packages/i18n/src/messages/{en,es}`, application metadata in `apps/web/src/app/[locale]/layout.tsx`, and the manifest in `apps/web/src/app/manifest.ts`. Replace the icons in `apps/web/public/icons` and customize `packages/ui/src/styles/globals.css`.
- Replace the transparent web logo in `apps/web/public/branding` and the README banner in `docs/assets` with your own branding.
- Add components with the pinned CLI from the workspace root: `pnpm --filter @repo/ui exec shadcn add dialog`. The UI package's `base-nova` configuration selects Base UI and writes shared components there.
- Import components from `@repo/ui/components/*` and `cn` from `@repo/ui/lib/utils`; the latter re-exports the `cn` package.
- Import dates and times from `@repo/temporal`; it selects native Temporal or a browser-compatible fallback. See [Temporal usage](docs/temporal.md) for serialization and hydration guidance.
- Use the shared Motion provider and Morphicons wrapper for animations that honor reduced motion. The compact-view toggle demonstrates both; see [animation guidance](docs/motion.md).
- Replace the task contracts, repository, and `/playground` workbench with your feature, updating the corresponding tests. Replace or remove the separate MCP App example too; keep the provider and transport infrastructure you need.
- Update the API title, version, tags, and descriptions in `apps/web/src/lib/openapi.ts`; keep route metadata with the contracts. See [OpenAPI customization and demo removal](docs/openapi.md).
- MCP tools follow the same OpenAPI operations automatically. Configure exposure and request authorization with the rest of the API; see [MCP customization](docs/mcp.md).
- MCP App interfaces have explicit resource associations. See [MCP Apps](docs/mcp-apps.md) for the widget's shared components, host connection, build pipeline, and removal checklist.
- Add or adapt translations in `@repo/i18n`; use typed next-intl hooks in the website and use-intl in standalone widgets. See [localization](docs/i18n.md) for routing, cache privacy, and supported-locale changes.

See [architecture](docs/architecture.md) for data access, state, caching, and removing the demo; [requirements](docs/requirements.md) records the stack and deferred choices. [React diagnostics](docs/diagnostics.md) explains scanner results and scoped exceptions. [Candidate skills](docs/skills.md) lists reviewed project-local agent skills and installation commands; none are installed by default.
