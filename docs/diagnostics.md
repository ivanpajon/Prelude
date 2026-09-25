# React diagnostics

React Doctor is an optional diagnostic tool for people and coding agents. The root configuration scans the complete `@repo/web` and `@repo/ui` packages without interactive prompts. It complements the browser tests and Next.js error output; it does not replace them or diagnose a running server automatically.

Run from the workspace root:

```sh
pnpm react-doctor
pnpm --silent react-doctor:json
```

The first command prints detailed findings with file locations. The second writes a structured JSON report to stdout; `--silent` removes pnpm's script banner so another tool can parse it. The script is named `react-doctor` because pnpm 11 has its own unrelated `doctor` command. React Doctor also recognizes this script name when checking whether the project is configured.

## Interpreting results

The configuration uses `blocking: "none"`: diagnostic findings are advisory and do not fail the command. An exit code of zero therefore does not mean the project has no issues. Review the findings before changing code; architectural boundaries and event-driven behavior can exceed a static rule's analysis.

For agents consuming JSON, inspect all of these:

- `ok` and `error`: `ok: false` or a populated error means the scanner failed, even if the diagnostics array is empty.
- `summary.errorCount`, `summary.warningCount`, and `diagnostics`: these contain the findings from a successful run.
- `projects`: confirm both intended packages were scanned, and check each project's `complete`, `skippedChecks`, and any `skippedCheckReasons`.
- `skippedProjects`, when present: a partial report must not be treated as a clean full scan.

React Doctor 0.9.14 emits JSON schema version 3. Consumers should validate `schemaVersion` when upgrading. A successful scan (`ok: true`) describes scanner execution, not the absence of diagnostics; a project's `complete: false` means its analysis was incomplete.

Biome remains the source formatter and regular linter, through `pnpm check`, `pnpm fix`, and the pre-commit hook. React Doctor is not part of those commands or `pnpm verify`. Commitlint continues to own the separate commit-message check.

## Local diagnostic defaults

Both scripts pass `--no-score`. In the pinned release this disables the remote score API, share links, and telemetry. Keep the flag in the command: telemetry initializes before configuration files are loaded. A missing numeric score is expected.

The configuration also disables the default Socket.dev dependency checks with `supplyChain.enabled: false`. The configured workflow analyzes local source without those external requests. It does not register a hosted service or require account credentials. Human-readable diagnostic dumps use the tool's temporary output location; JSON is sent to stdout.

React Doctor runs its own analysis engine, which includes oxlint and `eslint-plugin-react-hooks`. Their names may appear in the lockfile even though the repository has no ESLint configuration or ESLint lint command. The scanner's transitive TypeScript version is also independent of the template's TypeScript 6 compiler. Keep the direct React Doctor version and lockfile pinned together; inspect changed rules and rerun scans after upgrades.

## Scoped exceptions

The exceptions retain every other diagnostic for the affected files. Each has a specific reason:

| Package/file | Rule | Reason |
| --- | --- | --- |
| Web `package.json` | `react-doctor/require-reduced-motion` | The scanner examines each workspace package separately and cannot follow the `@repo/ui` provider import. The application is wrapped by the shared `MotionConfig` with `reducedMotion="user"`; Morphicons has its own matching wrapper. Browser and component tests exercise reduced-motion behavior. The UI package's reduced-motion check remains enabled. |
| Web `src/app/offline/page.tsx` | `react-doctor/nextjs-no-a-element` | The offline fallback intentionally uses a full document navigation for **Try again**, requesting fresh HTML after reconnection instead of relying on client-side navigation from the cached fallback. Ordinary internal navigation uses Next.js `Link`. |
| Web `src/components/pwa-provider.tsx` | `react-doctor/no-loading-flag-reset-outside-finally` | The update remains busy until the service worker takes control and reloads the page. Rejection, a missing registration, or the activation timeout clear the flag through the failure handler. Clearing it unconditionally in `finally` would re-enable activation while it is still pending. |
| UI `src/components/button.tsx` and `src/components/badge.tsx` | `react-doctor/only-export-components` | These generated shadcn modules export their components and CVA variant functions as the shared component API. This retains the upstream pattern and accepts its Fast Refresh limitation. If the modules become heavily customized, move the variant helpers into separate modules and remove the exception. |

Other initial findings led to code changes: task submission uses a synchronous reentry guard, the home link uses Next.js `Link`, and animations use `m` with a shared `LazyMotion` provider. The provider loads `domMax`, because the task rows and tile example need layout animation; the smaller `domAnimation` feature bundle does not include it. See [animation guidance](motion.md).

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

References: [CLI reference](https://www.react.doctor/docs/reference/cli-reference), [configuration](https://www.react.doctor/docs/configuration/config-files), [telemetry switch implementation](https://github.com/millionco/react-doctor/blob/main/packages/react-doctor/src/cli/utils/is-telemetry-enabled.ts), [Motion feature bundles](https://motion.dev/docs/react-reduce-bundle-size).
