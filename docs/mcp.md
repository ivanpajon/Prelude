# Native MCP API

Prelude exposes a Model Context Protocol server at **`/api/mcp`**. It derives tools from the same generated OpenAPI document used by Scalar; there is no second tool contract, generated tool source file, separate backend, or database. The endpoint uses stateless Streamable HTTP and runs inside the Next.js application.

## Tools and data

| Tool | Input | Behavior |
| --- | --- | --- |
| `listTasks` | `{ "status": "all" }` | Read all tasks, or filter with `active` or `completed`. |
| `createTask` | `{ "title": "Build a feature" }` | Create a task; trim its title before validating the 1–120-character limit. |
| `setTaskCompleted` | `{ "id": "task-id", "completed": true }` | Change an existing task's completion state. |
| `updateTaskTitle` | `{ "id": "task-id", "title": "Refine the feature" }` | Trim and validate a 1–120-character title; return the task with ID and completion unchanged. Missing IDs return `NOT_FOUND`. |
| `deleteTask` | `{ "id": "task-id" }` | Remove a task and return its previous data; missing or already-deleted IDs return `NOT_FOUND`. |

The tools execute real operations against the **public, shared, process-local demo repository**. All visitors and transports see the same data in one server process. Data resets on restart and is not synchronized across instances. MCP mutations become visible through REST, RPC, and server rendering; an already-open workbench needs a refetch or reload.

`mcp-from-openapi` **2.8.0** generates tool definitions and request mappings from `generateOpenApiSpec()`. The bridge dispatches mapped requests directly to the existing REST adapter with request-scoped context. It does not make an HTTP request back to itself or bypass ArkType validation, typed errors, the task mutation path-ID guards, or awaited mutation callbacks. The MCP SDK server and client are pinned to **2.2.0**. Zod is infrastructure for the SDK/tooling; ArkType remains the application schema source.

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

## Try it locally

```sh
pnpm dev
```

The managed development command first builds the widget, then starts Next.js and the pinned **MCP Inspector 2.8.0** together while watching widget sources. Open [the local Inspector page](http://localhost:3000/api/mcp/inspector) directly or use **Open Inspector** on `/playground`. The page embeds the full Inspector interface from `http://127.0.0.1:6274`; set `MCP_INSPECTOR_PORT` to choose another UI port. Its browser-reachable App sandbox defaults to port `6275`, configurable through `MCP_SANDBOX_PORT`; the additional internal app-origin helper remains dynamically allocated. The Inspector has one predefined application target using the actual Next.js port rather than assuming port 3000.

Enable the connection switch, open **Tools**, and execute a query or mutation. For `listTasks`, the pinned Inspector renders `status` as a JSON editor: enter `"all"`, `"active"`, or `"completed"`, including the quotes. To preview the widget, open **Apps**, select **List tasks** (`listTasks`), fill `status`, and choose **Open App**. Reopen the preview after a widget rebuild to load its new HTML. Inspector authentication remains enabled and its credentials stay inside the Inspector; the iframe URL contains no token and does not automatically connect. These local credentials do not add authentication to the application's public MCP endpoint. Stop the managed processes with Ctrl+C. All three development ports must be free and distinct; select different values before restarting if another process is using one.

The Inspector wrapper is **development-only** and returns 404 in production. Its embedded loopback URL is intended for a browser on the development machine. Both root `pnpm dev` and the web package's development command use the managed launcher. The latter accepts Next.js `--port`/`-p` or `PORT`; loopback hostnames are required.

For a terminal connectivity check, leave the application running and use:

```sh
pnpm mcp:check
pnpm mcp:check --url http://127.0.0.1:3001/api/mcp
```

This invokes the pinned Inspector CLI to list tools without mutating application data. To connect an agent, configure its MCP client with a Streamable HTTP URL such as `http://127.0.0.1:3000/api/mcp`. Client configuration belongs to the developer; the template does not register itself automatically with any agent, editor, or account. Configure the deployed HTTPS URL for remote clients.

## Exposure and configuration

The endpoint is **enabled by default**, including in production, to match the public demonstration API. No token, OAuth provider, user identity, or authorization policy is supplied. All mutation tools are available. Origin checks are transport protections, not authentication.

| Variable | Behavior |
| --- | --- |
| `MCP_ENABLED=false` | Return 404 from the MCP endpoint. Other API transports are unchanged. |
| `MCP_ALLOWED_ORIGINS` | Comma-separated production browser origins, such as `https://app.example.com,https://agent.example.com`. Each origin must match exactly, including scheme and port; wildcards are not accepted. |
| `MCP_INSPECTOR_PORT` | Local Inspector UI port; defaults to `6274`. |
| `MCP_SANDBOX_PORT` | Local Inspector App sandbox port; defaults to `6275`. Choose a different free port from Next.js and Inspector. |

Development accepts only loopback access and loopback browser origins. In production, native client requests without an `Origin` header are accepted. Requests with an `Origin` must match `MCP_ALLOWED_ORIGINS`; otherwise the endpoint returns 403. Do not treat an absent Origin header as a trusted user. Configure authentication and authorization in the shared request context/procedures before exposing private data, or disable MCP while that work is incomplete.

Set these values in the web application's environment, for example `apps/web/.env.local` during native development. Compose uses its optional root `.env` instead. A supplied `MCP_ENABLED` value must be `true` or `false`; invalid enablement or origin configuration fails visibly instead of silently opening access. The Inspector and sandbox ports control local development interfaces, not the public MCP endpoint. Docker publishes both on loopback with matching host/container port numbers; see [Docker ports](docker.md#environment-and-ports).

MCP responses use `Cache-Control: no-store`. The service worker bypasses `/api/`, including MCP, and the Inspector is not precached. There is no offline MCP support, persistent MCP session store, resource subscription service, or background polling process.

The task widget is the only supplied MCP resource. Stdio serving, other resources/prompts, filesystem tools, authentication, and persistence remain deferred. When customizing the application, update the MCP server name/version in `apps/web/src/lib/mcp.ts` alongside the OpenAPI metadata, widget identity, and application branding.

Modern clients negotiate protocol `2026-07-28`; legacy clients can use the earlier initialize handshake. The SDK preserves natural JSON output for modern clients. For a list result, legacy clients receive structured content as `{ "result": [...] }` with a matching output schema; the text content still contains the original JSON array. Object task results retain their natural shape. Application errors set the MCP tool result's `isError` flag, while malformed protocol requests and unknown tools use protocol errors. Unexpected server failures return a generic error without repository details or stack traces.

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

Reusing the existing adapter means its supported methods and input mapping still apply. Unsupported or truncated schemas fail catalog generation rather than silently dropping a tool or weakening its schema. Tool generation caches only the complete immutable catalog; failed generation can be retried. External schema references are disabled. Test new operations through both REST and MCP, including unsuccessful input and output validation.

Keep credentials and repository ownership in request context. When replacing the demo repository, update the MCP context factory alongside RPC, REST, and direct server calls. If adding cached server data, supply `onTasksChanged` consistently; MCP waits for it just as the other transports do. Tool discovery is not a substitute for procedure-level authorization.

To remove only the website's JSON explorer, remove `McpPlayground` from `apps/web/src/app/[locale]/playground/page.tsx` (public `/playground`), its section-navigation link, its component, the `app/actions/mcp-playground.ts` actions, the `lib/mcp-playground*` helpers/types, the `stores/mcp-playground-store.ts` draft store, and related tests. Remove its `Mcp` catalogs and client-provider namespace after those consumers are gone. The public MCP endpoint, App resource, and Inspector can remain. When replacing the task demo, update the explorer's `orpc.tasks.key()` invalidation to cover your own client queries. To remove the separate task widget, follow the [MCP App removal checklist](mcp-apps.md#replace-or-remove-the-example).

To remove MCP entirely, remove both examples and the widget build/resource integration, then its endpoint, bridge, development Inspector wrapper, managed Inspector launcher/check command, tests, and documentation. Remove the now-unused MCP dependencies and sandbox port configuration, and restore a plain Next.js/Turbo development command. Retain OpenAPI and Scalar if desired; the REST API does not depend on MCP. See [OpenAPI](openapi.md) for the shared specification and [architecture](architecture.md) for repository replacement.

## Verification

Unit tests exercise tool generation, request mapping, validation, response conversion, context isolation, transport guards, and mutation callbacks. Production acceptance connects a real SDK client, checks protocol compatibility and tool discovery, executes all five tools, and confirms MCP writes through REST/RPC and the page. Development browser acceptance uses the embedded Inspector to discover and execute the same tools. Production checks confirm the Inspector wrapper is absent and MCP responses are not cacheable.

Run `pnpm check`, `pnpm test`, and `pnpm verify` after changing the contract, SDK, converter, or Inspector. Do not run managed development acceptance alongside an ordinary development server: they share the Next.js development output and Inspector ports. Package upgrades must keep the SDK server/client versions aligned and verify that the generator's parameter mapping and output representation still match the bridge.

Pin upgrades explicitly in the web manifest for `mcp-from-openapi`, the aligned MCP SDK packages, and `ext-apps`, and in the root development manifest for the MCP client SDK and Inspector. Regenerate and commit the lockfile, then verify a frozen installation. SDK changes must pass both modern and legacy client scenarios; generator changes must preserve tool names, complete schemas, opt-outs, annotations, and errors; Inspector changes must pass its actual Apps/Tools UI and CLI checks. Inspector brings its own SDK dependency, so upgrading the application SDK alone does not upgrade Inspector's client. Keep widget build and CSP acceptance in the upgrade checks too.
