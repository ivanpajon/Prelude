# MCP Apps

Prelude publishes a removable task widget using the official **`@modelcontextprotocol/ext-apps` 2.0.3** package and MCP SDK **2.2.0**. A compatible MCP client can render it when calling `listTasks`. All four task tools use the same input schemas, JSON results, and OpenAPI contracts as the other transports; the widget adds a presentation layer, not another API.

The website and the MCP App have different roles:

- `/` introduces the template and retains the Motion and Morphicons previews.
- `/playground#tasks` contains the browser task workbench, including URL filters and compact view.
- `/playground#mcp` contains the JSON tool explorer, whose Server Actions use the server-side SDK.
- `/playground#mcp-app` explains connection and links to the development Inspector. It does not host an MCP App iframe or install an AppBridge.
- `ui://prelude/tasks.html` is an MCP resource read through `/api/mcp`, not a public website URL. Compatible clients render its HTML in their own sandbox.

## Preview in Inspector

Run `pnpm dev`, open `/playground`, and choose **Open Inspector**. The managed launcher builds the widget before starting Next.js and Inspector. Enable the Inspector's connection to the predefined Prelude server, open **Apps**, select **List tasks** (`listTasks`), fill the required `status` argument, and choose **Open App**. Status accepts `all`, `active`, or `completed`; in its JSON editor include the quotes, for example `"all"`.

The widget receives the originating tool input and result from the host. It displays that result without immediately fetching it again. Its filters and Refresh action call `listTasks`; creating, completing, and deleting tasks call `createTask`, `setTaskCompleted`, and `deleteTask`, then refresh the selected filter. Errors and cancellation remain visible for retry. Refresh another open browser page or client to see changes made outside it.

Each task has a keyboard-accessible delete button. Successful deletion removes its row and preserves the new-task draft. If another client already deleted a task, the failed call keeps the stale row and draft and displays an error; use **Refresh tasks** to reconcile the view.

Inspector's **Tools** interface and the website's JSON explorer remain available for inspecting raw arguments, schemas, and results. A client without MCP Apps support still receives normal JSON tool results.

Widget source and shared UI edits trigger a rebuild during development. An already-open iframe contains the previous HTML; close and reopen the preview, or rerun the associated tool in a new preview, to read the rebuilt resource. The widget has no separate HMR client or background polling. A failed rebuild retains the previous complete asset and reports the error in the development terminal.

Inspector is local development tooling. `/api/mcp/inspector` and its nested paths return 404 in production. Production users connect their own compatible client to the deployed HTTPS `/api/mcp` endpoint; Prelude does not embed a production MCP Apps host or configure users' agents automatically.

## Ports and Docker

The development defaults are three distinct ports:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` natively / `DEV_PORT` in Compose | `3000` | Next.js and `/api/mcp`. |
| `MCP_INSPECTOR_PORT` | `6274` | Authenticated Inspector interface. |
| `MCP_SANDBOX_PORT` | `6275` | Inspector's browser-reachable MCP App sandbox. |

Set native values in the web application's environment, such as `apps/web/.env.local`. For Compose, use the optional root `.env` or shell environment. Select three free, different ports, and restart the managed workflow after changing them. Use separate values and Compose project names for concurrent development checkouts.

`pnpm stack:dev` publishes all three ports on the host's `127.0.0.1` interface, using equal port numbers inside and outside the container. This makes the sandbox reachable by the host browser while keeping development access local. The Inspector's additional internal app-origin helper remains dynamically allocated and unpublished. Inspector authentication stays enabled; its token is not placed in the wrapper URL. These local protections do not add authentication to the application's MCP endpoint.

Production contains the generated widget resource, but no running Inspector, development sandbox, or widget compiler. See [Docker workflows](docker.md) for stack commands and environment handling.

## Resource and tool association

`apps/web/src/lib/mcp.ts` still generates its immutable tool catalog from `generateOpenApiSpec()`. The task example identifies entries by their stable `metadata.operationId`, after the generator applies renames and exclusions. It associates only `listTasks` with `ui://prelude/tasks.html` using `registerAppTool` and `_meta.ui.resourceUri`; the helper supports the legacy `ui/resourceUri` key too. Other metadata, annotations, and schemas remain intact.

`apps/web/src/lib/mcp-app-resource.ts` registers the HTML with `registerAppResource` and MIME type `text/html;profile=mcp-app`. At read time it replaces a single build placeholder with a non-executable JSON configuration containing the actual generated tool names:

```json
{
  "tools": {
    "listTasks": "listTasks",
    "createTask": "createTask",
    "setTaskCompleted": "setTaskCompleted",
    "deleteTask": "deleteTask"
  }
}
```

JSON is escaped before insertion into the HTML. Renaming a tool through the generator's operation metadata updates this configuration. Excluding any mutation omits its name and hides that control; excluding `listTasks` removes the example resource and association. Business schemas remain in `@repo/contracts`; this map contains names only.

Modern MCP clients receive a list as a natural JSON array. Legacy clients receive `{ "result": [...] }` in structured content, while their text content contains the original array. The widget accepts both, uses text JSON only when structured content is absent, and validates the display shape before rendering. It distinguishes a tool's `isError` response from transport failures. Task objects retain their normal shape through both protocol versions.

With ext-apps 2.0.3, the Apps handshake does not negotiate the host's MCP protocol version. Its `callServerTool` convenience method consequently selects a legacy validator that rejects natural arrays. The small `callHostTool` helper uses the public `App.request` overload with SDK 2.2.0's `CallToolResultSchema`, which validates both shapes without changing protocol versions or server results. It retains SDK cancellation and progress handling; real in-memory handshake tests cover both shapes and malformed results.

## Widget boundaries

The widget is a separate React document under `apps/web/src/mcp-apps/tasks`. It uses shared Base UI components and design tokens, host-provided theme variables, and its own TanStack Query client. Filters and drafts belong to this widget instance; they do not use the website's URL, Zustand store, providers, or QueryClient.

The official App SDK handles the host handshake and parent-window messaging. Tool calls go through the SDK's `tools/call` request via `callHostTool`; the widget does not fetch REST, RPC, MCP HTTP, or Server Actions directly. This preserves the host's connection and the server's existing context and validation. Event handlers are installed before connecting so the initial tool result is not missed. Teardown cancels work and releases the widget's connection, resize observer, and query state.

Resource metadata declares empty network, external-resource, and nested-frame allowlists. It requests no browser permissions or custom sandbox domain. The generated HTML also denies direct connections and external assets, permits only its inline script/styles and data images, and does not allow `unsafe-eval`. It contains no CDN imports, remote fonts, dynamic chunks, or server-only code.

The SDK uses its CSP-safe validation mode. Widget imports from `@repo/contracts` are type-only; it performs narrow display-shape checks instead of importing ArkType's runtime compiler into the sandbox. ArkType still validates all real inputs and outputs in the server procedures. Preserve this distinction when adding widget features.

The task repository remains **public, shared, and process-local**, with unauthenticated writes and no persistence across restarts. `MCP_ENABLED=false` disables access to tools and resources, as well as the website's MCP actions. Origin checks, iframe isolation, and tool annotations are not authorization. Add authentication and procedure-level authorization consistently across every API transport before adapting the demo to private data. There are no offline writes, subscriptions, or automatic mutation retries.

## Build and cache ownership

Normal commands manage the asset automatically:

```sh
pnpm dev
pnpm build
pnpm test:cache
```

`pnpm build` runs `scripts/build-mcp-apps.mjs` before Next.js and runs Serwist afterward. The script produces one self-contained file at `apps/web/.generated/mcp-apps/tasks.html`. It is ignored by Git and kept outside `public`, so it is served only as an MCP resource.

The script uses **tsdown 0.23.0** for a fully bundled browser IIFE and **Tailwind CLI 4.3.3** for the widget CSS. tsdown's internal Rolldown/Oxc compilation is a build implementation detail; no separate Oxc linter or source workflow is configured. Biome remains the sole source linter and formatter. Tailwind CLI's internal Lightning CSS processing applies to the widget build only; Next.js continues to use its existing Tailwind PostCSS configuration.

For an isolated asset build from the repository root:

```sh
node scripts/build-mcp-apps.mjs
```

The builder rejects unresolved imports, extra chunks, external CSS assets, and unsafe inline closing tags, then atomically replaces the HTML. Development watches widget sources and shared UI sources. Build-script or dependency changes require restarting development; Compose Watch handles the configured restart/rebuild triggers.

Turbo includes `.generated/mcp-apps/**` in build outputs and the builder script in cache inputs. `pnpm test:cache` removes only the known generated widget/worker files, restores the build cache, and compares their bytes. Next.js explicitly traces the widget HTML for `/api/mcp`, allowing the standalone Docker image to carry it without shipping the compiler or source tree.

The server loads HTML only when a client reads the resource. Production memoizes successful reads for the process lifetime; development reads the current rebuilt file each time. A missing or malformed asset returns a generic resource error while JSON tools remain usable. Rebuild and restart production after changing the widget. Task data and MCP responses are not cached with the HTML; all `/api/` traffic bypasses the service worker.

## Measure the widget build

Stop development watchers before measuring so they cannot overwrite the production asset during the run:

```sh
node scripts/measure-mcp-apps.mjs
```

The ignored `test-results/mcp-apps/report.json` records three sequential full production builds, raw JavaScript/CSS/HTML bytes, gzipped HTML bytes, versions, build options, and output hashes. Each timed build includes JavaScript bundling, a fresh Tailwind CLI process, and atomic HTML output. Runs share one Node process, so module and operating-system caches may be warmer after the first sample; these are not three independent cold builds. Gzip is a separate artifact-size measurement, not the size or transfer time of an MCP response. Use the report from the current source before claiming measured savings or timing improvements.

Measured on 2026-09-29 using Node 26.10.0 on Windows x64, with tsdown 0.23.0, Tailwind CLI 4.3.3 and Lightning CSS 1.32.0:

| Measurement | Result |
| --- | --- |
| Full production build, three sequential samples | 965.18 ms / 697.57 ms / 1,273.52 ms |
| JavaScript | 552,760 bytes |
| CSS | 29,271 bytes |
| Complete HTML | 582,523 bytes |
| Gzipped HTML | 165,099 bytes |

All three generated files were byte-identical. These measurements include the pinned React and MCP Apps runtimes; they describe this machine and source revision, not expected deployment latency.

## Replace or remove the example

To keep MCP Apps for a different feature, replace the widget UI/model, resource URI, operation-ID mapping, and generated asset path together. Keep application schemas and business logic in the existing contracts/API packages. Update the HTML build, standalone tracing, cache outputs, documentation, and Inspector/protocol/browser tests. A new OpenAPI operation becomes a JSON MCP tool automatically; its interactive interface still needs an explicit design and resource association.

To remove just the widget:

1. Remove `apps/web/src/mcp-apps/tasks`, its tests, the resource module/tests, and the task resource registration/metadata integration in `lib/mcp.ts`. Retain the regular generated `registerTool` path and JSON execution.
2. Remove `scripts/build-mcp-apps.mjs`, its tests, and `scripts/measure-mcp-apps.mjs`, its web build-script prefix and managed development child, and widget-specific Watch/restart handling.
3. Remove the generated-HTML trace include, Turbo widget outputs/builder input, and widget assertions in cache, browser, and Docker acceptance. Keep the worker cache checks.
4. Remove the `/playground#mcp-app` panel/link and update its section navigation. Keep the browser workbench and JSON explorer if useful.
5. Remove unused `ext-apps`, its now-unused direct peers, tsdown, and Tailwind CLI dependencies, then regenerate the lockfile. Retain SDK packages needed by JSON MCP and the independent Next.js Tailwind PostCSS setup.
6. If keeping Inspector only for JSON tools, remove widget-specific sandbox publishing/configuration and corresponding launcher/port checks together. If removing Inspector too, follow [MCP removal](mcp.md#add-change-or-remove-tools).

Run `pnpm verify` and, when Docker configuration remains, `pnpm test:stack` after changing these boundaries. The [verification guide](verification.md) describes the acceptance commands; generated reports are not committed as source.

References: [official MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps), [pinned server helpers](https://github.com/modelcontextprotocol/ext-apps/blob/v2.0.3/src/server/index.ts), and [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps/tree/v2.0.3).
