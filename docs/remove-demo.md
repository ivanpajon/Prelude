# Remove the demo

Prelude ships with a task demo: a shared in-memory task list, the `/playground` page with the task workbench and the MCP explorer, five task tools over REST and MCP, and the task MCP App. It shows the stack working end to end. When you start your own project, remove it in one step and keep the infrastructure.

## Steps

1. Finish the first installation (`pnpm install --frozen-lockfile`) and stop `pnpm dev` or any other running development server.
2. Commit or stash your work. The command refuses to start with uncommitted changes, so that `git diff` afterwards shows only what it changed.
3. Preview the changes and the commands that follow them. Nothing is written or run:

   ```sh
   pnpm remove-demo --dry-run
   ```

4. Remove the demo:

   ```sh
   pnpm remove-demo
   ```

5. Review the result with `git status` and `git diff`, then commit it, for example as `chore: remove the demo`.
6. Run `pnpm verify` for the production build and browser tests. With Docker running, also run `pnpm test:stack`.
7. Add your first procedure. See [Add or change a procedure](openapi.md#add-or-change-a-procedure).

The command uses Node built-ins only and works on Windows and Linux. It never commits.

`pnpm remove-demo --skip-checks` does the same, but skips `pnpm check` and `pnpm test` and says so at the end. It is meant for CI jobs whose checks already run in another job, like the **Demo removal** jobs in `.github/workflows/docker.yml`. If you use it, run `pnpm check` and `pnpm test` yourself before you commit: the command has already removed itself, so you fix any failure by hand.

## What it deletes

- The task contract and procedures and the in-memory repository in `packages/contracts` and `packages/api`.
- The `/playground` page with the task workbench and the MCP explorer, with their components, stores, Server Actions, and helpers in `apps/web`.
- The task MCP App: `apps/web/src/mcp-apps`, its MCP resource, its build script `scripts/build-mcp-apps.mjs`, and the [MCP Apps guide](mcp-apps.md).
- The task, MCP explorer, and widget message catalogs in English and Spanish.
- The demo tests: `*.tasks.test.ts` files and the `tests/demo/`, `tests/e2e/demo/`, `tests/dev/demo/`, and `tests/stack/demo/` folders.
- Its own tooling: `scripts/remove-demo.mjs` and its test, the `remove-demo` script in `package.json`, the **Demo removal (quick)** job in `.github/workflows/ci.yml`, the **Demo removal** jobs in `.github/workflows/docker.yml`, and this guide.

## What it edits

- **Marked blocks.** Shared files wrap demo-only lines between a `demo:start` and a `demo:end` comment, each on its own line: `// demo:start` in code, `{/* demo:start */}` in JSX, `# demo:start` in YAML, and `<!-- demo:start -->` in Markdown. The command deletes each block, markers included. Examples are the playground links in the header and on the home page, the task fields in the API context, the OpenAPI description and `Tasks` tag, the MCP App registration, the widget builder in the development launcher and Compose Watch, and demo paragraphs in the README, `AGENTS.md`, and the guides. An unbalanced or nested marker stops the command before it writes anything.
- **JSON files.** It removes the `Common.playground`, `Home.openPlayground`, and `Playground` messages, the `./widget` and `./limits` package exports, and the `@modelcontextprotocol/ext-apps`, `@modelcontextprotocol/core`, `use-intl`, `tsdown`, and `@tailwindcss/cli` dependencies, which only the demo imports. It also drops the widget step from the web build script and the widget input and output from `turbo.json`.

It also deletes `apps/web/.next/dev/types`, the route types that `pnpm dev` generated: they still name the deleted pages and would fail `pnpm check`, and `pnpm dev` writes them again when it starts.

Then, like `pnpm customize`, it runs `pnpm install` to update the lockfile, `pnpm fix` to format, and `pnpm check` and `pnpm test` (unless you pass `--skip-checks`). When they pass, it removes its own tooling and prints the next steps.

All of this comes from one list at the top of `scripts/remove-demo.mjs`. Its unit test fails if a listed path no longer exists, or if a marker appears in a file that is not listed.

## What you get

- An empty contract and router, with a comment that shows where each feature goes: `packages/contracts/src/index.ts` and `packages/api/src/router.ts`. The API context in `packages/api/src/router.ts` and `apps/web/src/lib/request-context.ts` has no fields yet.
- `/api/openapi.json` is a valid OpenAPI 3.1.1 document with an empty `paths` object, and the Scalar reference at `/api/docs` loads.
- `/api/mcp` advertises tools and lists none. `pnpm mcp:check` and the MCP Inspector still connect. Tools appear as soon as you add procedures.
- The home page, header, footer, language selector, English and Spanish catalogs, PWA and offline page, health endpoint, security headers, Docker workflows, CI, and all infrastructure tests stay.
- TanStack Query and nuqs stay wired in `apps/web/src/components/providers.tsx`. Zustand stays installed for your own stores.

The guides and `docs/requirements.md` describe the remaining project: demo-only paragraphs sit between markers and go with the demo. The records in `docs/verification-history.md` and `docs/docker-measurements.md` stay as they are. They describe the template as it was built and tested, demo included.

## If it stops

- **Uncommitted changes.** Commit or stash them, then run the command again.
- **Unbalanced markers.** Nothing was written. Fix the file and line named in the message.
- **A failed install, check, or test.** The demo changes stay for review, and the command stays available. Fix the reported problem and run `pnpm remove-demo` again. It finds nothing left to remove, skips the uncommitted-changes check, runs the checks again, and then removes itself.

## Remove only part of the demo

To keep some of the demo, skip the command and follow the feature notes instead: [MCP Apps](mcp-apps.md#replace-or-remove-the-example) for the widget, [MCP](mcp.md#add-change-or-remove-tools) for the JSON explorer or MCP as a whole, and [OpenAPI](openapi.md#authentication-persistence-and-removal) for REST and the Scalar reference.

A partial removal no longer matches the list in `scripts/remove-demo.mjs`, so its test fails and `pnpm test` goes red. Remove the command too: delete `scripts/remove-demo.mjs` and `scripts/remove-demo.test.mjs`, the `remove-demo` script in `package.json`, the **Demo removal (quick)** job (`demo-removal-quick`) in `.github/workflows/ci.yml`, and the **Demo removal** jobs (`demo-removal`) with the demo paths in `.github/workflows/docker.yml`.
