# React diagnostics

React Doctor is an optional diagnostic tool for people and coding agents. The root configuration scans the complete `@repo/web` and `@repo/ui` packages without interactive prompts. It complements the browser tests and Next.js error output; it does not replace them or diagnose a running server automatically.

Run from the workspace root:

```sh
pnpm react-doctor
pnpm --silent react-doctor:json
```

The first command prints detailed findings with file locations. The second writes a structured JSON report to stdout; `--silent` removes pnpm's script banner so another tool can parse it. The script is named `react-doctor` because pnpm has its own unrelated `doctor` command. React Doctor also recognizes this script name when checking whether the project is configured.

## Interpreting results

The configuration uses `blocking: "none"`: diagnostic findings are advisory and do not fail the command. An exit code of zero therefore does not mean the project has no issues. Review the findings before changing code; architectural boundaries and event-driven behavior can exceed a static rule's analysis.

For agents consuming JSON, inspect all of these:

- `ok` and `error`: `ok: false` or a populated error means the scanner failed, even if the diagnostics array is empty.
- `summary.errorCount`, `summary.warningCount`, and `diagnostics`: these contain the findings from a successful run.
- `projects`: confirm both intended packages were scanned, and check each project's `complete`, `skippedChecks`, and any `skippedCheckReasons`.
- `skippedProjects`, when present: a partial report must not be treated as a clean full scan.

The JSON report has a `schemaVersion` field (version 3 when this guide was written). Consumers should validate it, because a React Doctor update can change it. A successful scan (`ok: true`) describes scanner execution, not the absence of diagnostics; a project's `complete: false` means its analysis was incomplete.

Biome remains the source formatter and regular linter, through `pnpm check`, `pnpm fix`, and the pre-commit hook. React Doctor is not part of those commands or `pnpm verify`. Commitlint continues to own the separate commit-message check.

## Local diagnostic defaults

Both scripts pass `--no-score`. In the pinned release this disables the remote score API, share links, and telemetry. Keep the flag in the command: telemetry initializes before configuration files are loaded. A missing numeric score is expected.

The configuration also disables the default Socket.dev dependency checks with `supplyChain.enabled: false`. The configured workflow analyzes local source without those external requests. It does not register a hosted service or require account credentials. Human-readable diagnostic dumps use the tool's temporary output location; JSON is sent to stdout.

React Doctor runs its own analysis engine, which includes oxlint and `eslint-plugin-react-hooks`. Their names may appear in the lockfile even though the repository has no ESLint configuration or ESLint lint command. The scanner's transitive TypeScript version is also independent of the template's TypeScript 6 compiler. Keep the direct React Doctor version and lockfile pinned together; inspect changed rules and rerun scans after upgrades.

## Scoped exceptions

The exceptions retain every other diagnostic for the affected files. Each has a specific reason:

| Package/file | Rule | Reason |
| --- | --- | --- |
| Web `package.json` | `react-doctor/require-reduced-motion` | The scanner examines each workspace package separately and cannot follow the `@repo/ui` provider import. Each animated section is wrapped by the shared provider, whose `MotionConfig` uses `reducedMotion="user"`; Morphicons has its own matching wrapper. Browser and component tests exercise reduced-motion behavior. The UI package's reduced-motion check remains enabled. |
| Web `src/app/(standalone)/offline/offline-content.tsx` | `react-doctor/nextjs-no-a-element` | The offline fallback intentionally uses a full document load for **Try again**: it reloads the address that failed, so the browser requests fresh HTML after reconnection instead of relying on client-side navigation from the cached fallback. Without JavaScript, the link opens the home page. Ordinary internal navigation uses the locale-aware `Link`. |
| Web `src/components/site-header.tsx` | `react-doctor/nextjs-no-a-element` | The **API docs** link opens `/api/docs`, a Route Handler rather than a page, so it needs a full page load; `Link` would try client-side navigation and prefetching. The home link in the same header uses `Link`. |
| Web `src/app/actions/locale.ts` | `react-doctor/server-auth-actions` | Anonymous visitors may set their own language cookie to one of two validated values. This action changes no protected/shared data and invokes no billable service; authentication would prevent anonymous language selection. Business actions still require their own authorization policy. |
| UI `src/components/button.tsx` and `src/components/badge.tsx` | `react-doctor/only-export-components` | These generated shadcn modules export their components and CVA variant functions as the shared component API. This retains the upstream pattern and accepts its Fast Refresh limitation. If the modules become heavily customized, move the variant helpers into separate modules and remove the exception. |

Other initial findings led to code changes: the home link uses Next.js `Link`, and animations use `m` with a shared `LazyMotion` provider around each animated section. The provider loads `domMax`, because the home page tile example needs layout animation; the smaller `domAnimation` feature bundle does not include it. See [animation guidance](motion.md).

<!-- demo:start -->
In the demo, task submission uses a synchronous reentry guard, and the task rows also use layout animation.
<!-- demo:end -->

Scoped overrides use arrays for both `files` and `rules`:

```json
{
  "ignore": {
    "overrides": [
      {
        "files": ["package.json"],
        "rules": ["react-doctor/require-reduced-motion"]
      }
    ]
  }
}
```

Paths are relative to the scanned package. Use a package-local configuration when an exception must apply to only one package; local exceptions merge with the root scan configuration. Omitting `rules` suppresses every rule for the matching file, so always name the intended rule. Remove exceptions when their underlying reason no longer applies rather than extending them to new files automatically.

The offline override uses `src/app/**/offline/offline-content.tsx` because these are glob patterns: a literal route-group name in parentheses can be interpreted as pattern syntax. This matches the offline component under `(standalone)` while retaining all other rules for that file.

## Known warnings

The scan reports these warnings and no errors. They stay visible on purpose: each one is a trade-off, not a bug. Recheck them after you change the files.

| Package/file | Rule | Why it stays, or how to fix it |
| --- | --- | --- |
| Web `src/app/[routingMode]/[locale]/layout.tsx` | `react-doctor/async-parallel` | The five awaits read the routing mode, the locale, and catalogs that next-intl already holds for the request; none of them waits on the network. The routing mode must also pass `notFound()` before the rest run. |
| Web `src/lib/mcp.ts` | `react-doctor/server-sequential-independent-await` | The tool catalog is built once and then reused, and the default `getContext` is synchronous, so the second await costs nothing. If your context does slow work, such as reading a session, run both with `Promise.all`. |
| Web `src/lib/openapi.ts` | `react-doctor/js-set-map-lookups` | The list holds a route's path parameters, usually one or two, so a `Set` would not be faster. |
| Web `src/i18n/navigation.tsx` | `react-doctor/only-export-components` | `getPathname` sits next to the navigation hooks that use the same configuration. Editing this file reloads the page instead of keeping state with Fast Refresh. Move `getPathname` to its own `.ts` module if that gets in the way. |
| Web `src/i18n/routing-preference-provider.tsx` | `react-doctor/jsx-no-constructed-context-values` | The provider renders again only when its own state changes, which changes the value anyway, or on navigation. Its readers are the two language controls, so `useMemo` would save little. |
| UI `src/components/toast.tsx` | `react-doctor/only-export-components` | `toast` is the shared notification manager that the app imports together with `Toaster`. It is the same trade-off as the button and badge variants above. |

<!-- demo:start -->
The demo files add these warnings. `pnpm remove-demo` deletes the files.

| Package/file | Rule | Why it stays, or how to fix it |
| --- | --- | --- |
| Web `src/components/mcp-playground.tsx`, `src/components/task-workbench.tsx`, and `src/mcp-apps/tasks/app.tsx` | `react-doctor/no-high-complexity-react-function`, and `react-doctor/no-giant-component` for the task workbench | These examples keep each flow in one place so you can read it top to bottom. Split them into smaller components if you keep them. |
| Web `src/lib/mcp-playground-format.ts` | `react-doctor/js-set-map-lookups` | The list holds a schema's few required keys. |
| Web `src/mcp-apps/tasks/app.tsx` | `react-doctor/only-export-components` | tsdown bundles the widget into a static HTML file; Next.js does not serve it, so Fast Refresh does not apply. |
| Web `src/mcp-apps/tasks/app.tsx` | `react-doctor/no-loading-flag-reset-outside-finally` | `session.mutate()` catches its own errors and resolves `false`, so the reset after it always runs. |
| Web `src/mcp-apps/tasks/app.tsx` | `react-doctor/no-adjust-state-on-prop-change` | The effect closes the title editor when its task disappears from the host's data, for example after a delete elsewhere, and records where focus goes next. |
<!-- demo:end -->

References: [CLI reference](https://www.react.doctor/docs/reference/cli-reference), [configuration](https://www.react.doctor/docs/configuration/config-files), [telemetry switch implementation](https://github.com/millionco/react-doctor/blob/main/packages/react-doctor/src/cli/utils/is-telemetry-enabled.ts), [Motion feature bundles](https://motion.dev/docs/react-reduce-bundle-size).
