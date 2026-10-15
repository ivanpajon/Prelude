# Native MCP API

The app exposes a Model Context Protocol server at **`/api/mcp`**. It derives tools from the same generated OpenAPI document used by Scalar; there is no second tool contract, generated tool source file, separate backend, or database. The endpoint uses stateless Streamable HTTP and runs inside the Next.js application.

## Tools and data

Each procedure in the router becomes one tool, named after its `operationId`. `mcp-from-openapi` generates tool definitions and request mappings from `generateOpenApiSpec()`. The bridge dispatches mapped requests directly to the existing REST adapter with request-scoped context. It does not make an HTTP request back to itself or bypass ArkType validation, typed errors, the path-parameter guard, or awaited mutation callbacks. The MCP SDK server and client are pinned to the same version. Zod is infrastructure for the SDK/tooling; ArkType remains the application schema source.

<!-- demo:start -->
The task demo exposes five tools:

| Tool | Input | Behavior |
| --- | --- | --- |
| `listTasks` | `{ "status": "all" }` | Read all tasks, or filter with `active` or `completed`. |
| `createTask` | `{ "title": "Build a feature" }` | Create a task; trim its title before validating the 1–120-character limit. |
| `setTaskCompleted` | `{ "id": "task-id", "completed": true }` | Change an existing task's completion state. |
| `updateTaskTitle` | `{ "id": "task-id", "title": "Refine the feature" }` | Trim and validate a 1–120-character title; return the task with ID and completion unchanged. Missing IDs return `NOT_FOUND`. |
| `deleteTask` | `{ "id": "task-id" }` | Remove a task and return its previous data; missing or already-deleted IDs return `NOT_FOUND`. |

The tools execute real operations against the **public, shared, process-local demo repository**. All visitors and transports see the same data in one server process. Data resets on restart and is not synchronized across instances. The list keeps at most 100 tasks; each create beyond that evicts the oldest task. MCP mutations become visible through REST, RPC, and server rendering; an already-open workbench needs a refetch or reload.

### Tool annotations

Each task contract explicitly supplies these hints through its OpenAPI `x-mcp.annotations` metadata:

| Tool | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| `listTasks` | `true` | `false` | `true` | `false` |
| `createTask` | `false` | `false` | `false` | `false` |
| `setTaskCompleted` | `false` | `true` | `true` | `false` |
| `updateTaskTitle` | `false` | `true` | `true` | `false` |
| `deleteTask` | `false` | `true` | `true` | `false` |

Creation only adds data, but repeating it creates another task. Completion and title updates overwrite existing values, so they are destructive even though they do not delete a row. Repeating either update with identical arguments has the same effect. Deletion is also idempotent: a repeated call returns `NOT_FOUND`, but does not change the resulting task state. Idempotence describes effects, not identical responses. All tools operate within the closed domain of this local demo repository. MCP defines destructive and idempotent hints as relevant only to writable tools. See the [official annotation definitions](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations).

These hints help clients describe operations; they do not authorize calls or enforce permissions. Revisit the matrix when replacing the repository or adding side effects, including mutation callbacks that send notifications or invoke external services.

## Website playground

Open `/playground#mcp` for the live JSON tool explorer; `/playground#tasks` contains the browser workbench above it. Choose **Discover tools**, select a generated tool, edit its JSON arguments, and choose **Run tool**. Nothing is executed automatically. Tool descriptions, schemas, and read-only hints come from MCP discovery rather than a second hard-coded catalog. Starter arguments use schema defaults, examples, enums, and required fields; they are suggestions and may need editing. The homepage retains its separate Motion and Morphicons previews.

Results display natural JSON, including arrays, and tool failures remain visible for correction and retry. `createTask`, `updateTaskTitle`, `setTaskCompleted`, and `deleteTask` change the same public demo data as REST and RPC. Successful playground calls invalidate the workbench's task queries, so this page reflects changes without reloading. Other tabs still need their own refetch or reload. Deletion is marked destructive in tool annotations and returns the removed task.

The browser calls same-origin Next.js Server Actions. Each action verifies the actual Host and Origin, respects development loopback restrictions and runtime `MCP_ENABLED`, then creates a fresh official MCP SDK client. The client exchanges real discovery/tool protocol messages with the shared endpoint in process, without a network request back to the application. Identity headers reach the same context factory in `apps/web/src/lib/mcp-endpoint.ts`; the SDK remains outside the browser bundle. Add future authorization there and in the shared procedures, not only in the widget.

This action bridge works in production without adding the application's origin to `MCP_ALLOWED_ORIGINS`. The public `/api/mcp` HTTP endpoint retains its explicit browser-origin allowlist; the action verifies its own same-origin caller before acting as a native server-side client. Forwarded headers do not establish trust. Reverse-proxy deployments must preserve the caller's public Host for the action's exact comparison. `MCP_ENABLED=false` disables playground discovery and execution too, with an explanatory message in the UI. Action responses and their MCP exchanges are not cached; there is no offline playground or automatic mutation retry.

The separate `listTasks` MCP App is published at `ui://prelude/tasks.html` for compatible hosts. It keeps the same tool schemas and JSON outputs; the resource supplies a sandboxed task interface with host-mediated calls. `/playground#mcp-app` explains how to connect and links to the development Inspector, without embedding a custom App host. See [MCP Apps](mcp-apps.md) for the resource, build, CSP, and removal boundaries.
<!-- demo:end -->

## Try it locally

```sh
pnpm dev
```

The managed development command starts Next.js and the pinned **MCP Inspector** together. Open [the local Inspector page](http://localhost:3000/api/mcp/inspector). The page embeds the full Inspector interface from `http://127.0.0.1:6274`; set `MCP_INSPECTOR_PORT` to choose another UI port. Its browser-reachable App sandbox defaults to port `6275`, configurable through `MCP_SANDBOX_PORT`; the additional internal app-origin helper remains dynamically allocated. The Inspector has one predefined application target using the actual Next.js port rather than assuming port 3000.

Enable the connection switch, open **Tools**, and execute a query or mutation.

<!-- demo:start -->
With the demo, the command also builds the task widget first and watches its sources, and **Open Inspector** on `/playground` opens the same page. For `listTasks`, the pinned Inspector renders `status` as a JSON editor: enter `"all"`, `"active"`, or `"completed"`, including the quotes. To preview the widget, open **Apps**, select **List tasks** (`listTasks`), fill `status`, and choose **Open App**. Reopen the preview after a widget rebuild to load its new HTML.
<!-- demo:end -->

Inspector authentication remains enabled and its credentials stay inside the Inspector; the iframe URL contains no token and does not automatically connect. These local credentials do not add authentication to the application's public MCP endpoint. Stop the managed processes with Ctrl+C. All three development ports must be free and distinct; select different values before restarting if another process is using one.

For a lighter setup, run `pnpm dev:app` (the launcher's `--no-inspector` option). It starts Next.js, but no Inspector or sandbox, so only the Next.js port must be free; it prints `Next.js: http://127.0.0.1:3000 (MCP Inspector skipped: --no-inspector)` when ready. The `/api/mcp` endpoint and `pnpm mcp:check` still work; the Inspector page has nothing to show. `MCP_ENABLED=false` skips the Inspector and its sandbox automatically, because the endpoint they connect to returns 404; the Inspector page then returns 404 too.

The Inspector wrapper is **development-only** and returns 404 in production. Its embedded loopback URL is intended for a browser on the development machine. Both root `pnpm dev` and the web package's development command use the managed launcher. The latter accepts Next.js `--port`/`-p` or `PORT`; loopback hostnames are required.

For a terminal connectivity check, leave the application running and use:

```sh
pnpm mcp:check
pnpm mcp:check --url http://127.0.0.1:3001/api/mcp
```

This invokes the pinned Inspector CLI to list tools without mutating application data. To connect an agent, configure its MCP client with a Streamable HTTP URL such as `http://127.0.0.1:3000/api/mcp`. Client configuration belongs to the developer; the template does not register itself automatically with any agent, editor, or account. Configure the deployed HTTPS URL for remote clients.

## Exposure and configuration

The endpoint is **enabled by default**, including in production. No token, OAuth provider, user identity, or authorization policy is supplied. Every procedure not excluded with `x-mcp`, including mutations, is available as a tool. Origin checks are transport protections, not authentication.

| Variable | Behavior |
| --- | --- |
| `MCP_ENABLED=false` | Return 404 from the MCP endpoint. Other API transports are unchanged. |
| `MCP_ALLOWED_ORIGINS` | Comma-separated production browser origins, such as `https://app.example.com,https://agent.example.com`. Each origin must match exactly, including scheme and port; wildcards are not accepted. |
| `MCP_INSPECTOR_PORT` | Local Inspector UI port; defaults to `6274`. |
| `MCP_SANDBOX_PORT` | Local Inspector App sandbox port; defaults to `6275`. Choose a different free port from Next.js and Inspector. |

Development accepts only loopback access and loopback browser origins. In production, native client requests without an `Origin` header are accepted. Requests with an `Origin` must match `MCP_ALLOWED_ORIGINS`; otherwise the endpoint returns 403. Do not treat an absent Origin header as a trusted user. Configure authentication and authorization in the shared request context/procedures before exposing private data, or disable MCP while that work is incomplete.

Set these values in the web application's environment, for example `apps/web/.env.local` during native development. Compose uses its optional root `.env` instead. The server reads them at run time, so a new value needs a restart, not a rebuild. A supplied `MCP_ENABLED` value must be `true` or `false`. `apps/web/src/env.ts` checks the values when the server starts: an invalid one stops startup with an error that names each invalid variable and its allowed form, instead of silently opening access. The MCP endpoint checks again on each request, so a value that becomes invalid while `next dev` reloads `.env.local` returns 500 and logs the reason. The Inspector and sandbox ports control local development interfaces, not the public MCP endpoint. Docker publishes both on loopback with matching host/container port numbers; see [Docker ports](docker.md#environment-and-ports).

MCP responses use `Cache-Control: no-store`. The service worker bypasses `/api/`, including MCP, and the Inspector is not precached. There is no offline MCP support, persistent MCP session store, resource subscription service, or background polling process.

Stdio serving, prompts, a general resource framework, filesystem tools, authentication, and persistence remain deferred. The MCP server name comes from the site slug in `apps/web/src/site.ts`; update its version in `apps/web/src/lib/mcp.ts` alongside the OpenAPI metadata and application branding.

<!-- demo:start -->
The task widget is the only supplied MCP resource. Update its identity together with the server metadata when customizing the demo.
<!-- demo:end -->

Modern clients negotiate protocol `2026-07-28`; legacy clients can use the earlier initialize handshake. The SDK preserves natural JSON output for modern clients. For a list result, legacy clients receive structured content as `{ "result": [...] }` with a matching output schema; the text content still contains the original JSON array. Object results retain their natural shape. Application errors set the MCP tool result's `isError` flag, while malformed protocol requests and unknown tools use protocol errors. Unexpected server failures return a generic error without repository details or stack traces.

## Add, change, or remove tools

Add route metadata and schemas to an oRPC contract, implement the procedure, and include it in the router. Stable, unique `operationId` values become tool names. Summaries, descriptions, examples, and schemas come from the generated OpenAPI document; keep them useful to agents as well as humans. Eligible operations, including deprecated operations, are generated automatically. Use the generator's `x-mcp` extension to exclude operations or override tool annotations. Enablement inherits root, path, then operation settings, with the more-specific setting taking precedence; put name, annotation, and metadata overrides on the operation itself. Read-only/destructive hints describe tools to clients; they do not enforce permissions.

For example, this OpenAPI operation extension hides one operation from MCP while retaining its REST endpoint and Scalar documentation:

```json
{ "x-mcp": false }
```

This extension overrides an operation's inferred hints when those statements accurately describe its behavior:

```json
{
  "x-mcp": {
    "annotations": {
      "destructiveHint": false,
      "idempotentHint": true
    }
  }
}
```

Keep these extensions with the contract's OpenAPI metadata, using the existing `.route({ spec: operation => ... })` customization point and preserving the generated operation and schemas. The [generator's annotation documentation](https://github.com/agentfront/mcp-from-openapi/blob/main/docs/annotations.md) describes its extension family; consult the source matching the pinned release when upgrading.

The server always advertises the tools capability. An API without operations, such as a new project before its first procedure, answers `tools/list` with an empty list, so clients, Inspector, and `pnpm mcp:check` still connect. Resources are advertised only when one is registered; without one, `resources/list` returns the standard "Method not found" error.

Reusing the existing adapter means its supported methods and input mapping still apply. Unsupported or truncated schemas fail catalog generation rather than silently dropping a tool or weakening its schema. Tool generation caches only the complete immutable catalog; failed generation can be retried. External schema references are disabled. Test new operations through both REST and MCP, including unsuccessful input and output validation.

Keep credentials and repository ownership in request context. MCP uses the same `createRequestContext()` in `apps/web/src/lib/request-context.ts` as RPC, REST, and direct server calls, so a repository or session added there reaches every transport. If adding cached server data, put the invalidation callback in that context; MCP waits for mutation callbacks just as the other transports do. Tool discovery is not a substitute for procedure-level authorization.

<!-- demo:start -->
To remove the whole task demo, including the JSON explorer and the task widget, run `pnpm remove-demo`; see [Remove the demo](remove-demo.md).

To remove only the website's JSON explorer, remove `McpPlayground` from `apps/web/src/app/[routingMode]/[locale]/playground/page.tsx` (public `/en/playground`, `/es/playground`, or `/playground` in unprefixed mode), its section-navigation link, its component, the `app/actions/mcp-playground.ts` actions, the `lib/mcp-playground*` helpers/types, the `stores/mcp-playground-store.ts` draft store, and related tests. Remove its `Mcp` catalogs and client-provider namespace after those consumers are gone. The public MCP endpoint, App resource, and Inspector can remain. When replacing the task demo, update the explorer's `orpc.tasks.key()` invalidation to cover your own client queries. To remove the separate task widget, follow the [MCP App removal checklist](mcp-apps.md#replace-or-remove-the-example).

After any partial removal, including removing MCP entirely below, also remove the `pnpm remove-demo` command; see [Remove only part of the demo](remove-demo.md#remove-only-part-of-the-demo).
<!-- demo:end -->

To remove MCP entirely, first remove the website code that calls it and any MCP App resources, then its endpoint, bridge, development Inspector wrapper, managed Inspector launcher/check command, tests, and documentation. Remove the now-unused MCP dependencies and sandbox port configuration, and restore a plain `next dev` development command. Retain OpenAPI and Scalar if desired; the REST API does not depend on MCP. See [OpenAPI](openapi.md) for the shared specification and [architecture](architecture.md) for repository replacement.

## Verification

Unit tests exercise tool generation, request mapping, validation, response conversion, context isolation, transport guards, and mutation callbacks, using a test-only notes API. Production acceptance connects a real SDK client and checks protocol compatibility and tool discovery. Development browser acceptance connects the embedded Inspector and opens its **Tools** screen. Production checks confirm the Inspector wrapper is absent and MCP responses are not cacheable.

<!-- demo:start -->
The demo suites also execute all five task tools, confirm MCP writes through REST, RPC, and the page, and run the same tools in the embedded Inspector.
<!-- demo:end -->

Run `pnpm check`, `pnpm test`, and `pnpm verify` after changing the contract, SDK, converter, or Inspector. Do not run managed development acceptance alongside an ordinary development server: they share the Next.js development output. Package upgrades must keep the SDK server/client versions aligned and verify that the generator's parameter mapping and output representation still match the bridge.

Pin upgrades explicitly in the web manifest for `mcp-from-openapi` and the aligned MCP SDK packages, and in the root development manifest for the MCP client SDK and Inspector. Regenerate and commit the lockfile, then verify a frozen installation. SDK changes must pass both modern and legacy client scenarios; generator changes must preserve tool names, complete schemas, opt-outs, annotations, and errors; Inspector changes must pass its actual Tools UI and CLI checks. Inspector brings its own SDK dependency, so upgrading the application SDK alone does not upgrade Inspector's client.

<!-- demo:start -->
The demo also pins `ext-apps` in the web manifest. Keep the widget build, its CSP, and the Inspector's **Apps** preview in the upgrade checks too.
<!-- demo:end -->
