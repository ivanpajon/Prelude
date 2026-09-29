# OpenAPI and Scalar

The same oRPC procedures serve the workbench over RPC, direct Server Component calls, and a public REST API. `OpenAPIReferencePlugin` generates the OpenAPI 3.1.1 document and Scalar page on request from the implemented contract. The native MCP endpoint derives its tools from the same document and dispatches calls through the REST adapter. No specification file, generation command, separate backend, or database is required. See [MCP usage](mcp.md) for agent connections and the development Inspector.

## Endpoints

| Endpoint | Input and behavior |
| --- | --- |
| `GET /api/docs` | Public, interactive Scalar reference; linked from the shared homepage/playground navigation. |
| `GET /api/openapi.json` | Generated specification, titled **Prelude API**, version **1.0.0**. |
| `GET /api/v1/tasks?status=all` | Required status: `all`, `active`, or `completed`; returns 200. |
| `POST /api/v1/tasks` | JSON `{ "title": "Build a feature" }`; returns the new task with 201. |
| `PATCH /api/v1/tasks/{id}` | JSON `{ "completed": true }`; returns the updated task with 200, or `NOT_FOUND` with 404. |

Invalid inputs return 400; invalid procedure outputs return 500. POST titles are trimmed before the normalized 1–120-character constraint is checked. PATCH IDs belong only in the URL: a body containing `id` returns 400, even when it matches the path. This adapter guard prevents oRPC's compact body merge from overriding the path parameter.

**The demo is public and shared.** Scalar's request client executes real reads and writes against the same process-local repository as the workbench. Data resets when the server process restarts and differs between server instances. Scalar mutations do not invalidate another page's TanStack Query client; reload or refetch an open workbench to see them.

The browser workbench now lives at `/playground#tasks`. The separate [MCP App](mcp-apps.md) uses the same generated tools and contracts through its host's connection. Its HTML resource and UI metadata do not change REST inputs, response bodies, or OpenAPI schemas.

## Add or change a procedure

1. Define browser-safe ArkType schemas and an `oc` contract in `@repo/contracts`. Add `.route({ method, path, operationId, tags, summary, description })`, stable unique operation IDs, declared errors, and the appropriate success status. Paths are relative to `/api`, such as `/v1/tasks`; the generated document uses `/api` as its server URL.
2. Add examples with a `.route({ spec: operation => ... })` callback that preserves generated schemas. The task contract demonstrates query and JSON-body examples. Do not replace the operation with a hand-written schema that can drift from runtime validation.
3. Implement the contract in `@repo/api`, using request context for data access and shared mutation invalidation. Adding the implementation to the router exposes it through RPC, REST, and generated MCP tools; no separate business logic is needed for each transport.
4. Export any newly needed HTTP verb from `apps/web/src/app/api/[...rest]/route.ts` (currently GET, POST, and PATCH). For compact inputs, keep path parameters out of request bodies and add or adapt a guard where a body could override them. The existing PATCH guard is specific to `/api/v1/tasks/{id}`.
5. Test specification mapping and real HTTP validation alongside the procedure. Review `/api/openapi.json` and exercise the endpoint in Scalar. Its operation ID also becomes the generated MCP tool name; check its arguments and behavior in the development Inspector. Update the API title, version, description, and shared tags in `apps/web/src/lib/openapi.ts` when customizing the template.

The converter in the web package adapts oRPC 1.15.4's ArkType integration: input schemas use `.in`, and response schemas use `.out`. For trimmed titles, the input JSON Schema describes a string while the output describes the normalized length bounds; endpoint descriptions explain the additional normalization rules. Arbitrary refinements that ArkType cannot represent, and defined non-ArkType schemas, fail generation instead of silently producing an empty schema. Procedures with no input or output schema remain supported.

All oRPC packages are pinned to **1.15.4**. Use the matching [stable OpenAPI guide](https://v1.orpc.dev/docs/openapi/openapi-specification) and [reference-plugin documentation](https://v1.orpc.dev/docs/openapi/plugins/openapi-reference) when extending or upgrading the integration.

## Scalar renderer and caching

`docsScriptUrl` pins this standalone browser bundle:

```text
https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js
```

There is no local `@scalar/api-reference` dependency, bundle-copy script, or generated Scalar asset. Loading the interactive reference requires access to jsDelivr; the JSON specification and REST API do not depend on that CDN. Upgrading oRPC does not change the renderer version. To upgrade Scalar, change the explicit version in `docsScriptUrl`, update the matching unit and browser assertions, and run `pnpm verify`. Follow Scalar's [renderer-pinning guidance](https://scalar.com/products/api-references/integrations/nextjs#pin-the-browser-renderer).

Scalar uses its responsive layout and hash navigation with the title **Prelude API Reference**. External fonts, telemetry, and Scalar Agent are disabled. Requests go directly to the application's origin; no request proxy or cross-origin API configuration is provided.

RPC, REST, documentation, and specification responses use `Cache-Control: no-store`. The service worker bypasses every `/api/` request and external resources, so it neither caches the documentation/API responses nor precaches Scalar. Offline documentation is not supported. The browser's ordinary HTTP caching of the CDN bundle is separate from the service worker.

## Replace or remove the demo

- Replace the task schemas, route metadata, procedures, repository, and `/playground` workbench together. Update examples, API descriptions, the `Tasks` tag, operation IDs, the task-specific PATCH guard, and their unit/browser tests. Replace or remove the associated MCP App resource and widget as described in [its removal checklist](mcp-apps.md#replace-or-remove-the-example). Keep documentation generation if you want it for the replacement routes.
- When adding authentication or persistence, initialize the authorized context in the RPC, REST, and MCP Route Handlers and the direct server client. Keep authorization in the shared procedures/repository so every transport enforces it. Supply cache invalidation consistently across these entry points if server data becomes cached, and choose which contracts to expose in public docs and MCP discovery.
- To remove REST and documentation entirely, first remove or replace the dependent MCP bridge as described in [MCP removal](mcp.md#add-change-or-remove-tools). Then remove the REST catch-all, `apps/web/src/lib/openapi.ts` and its tests, the shared header and homepage stack-card **API docs** links, and related browser checks. Remove `@orpc/openapi`, `@orpc/arktype`, and their now-unused direct peers from the web package, then regenerate the lockfile. Retain RPC and its shared contracts if the application still uses them.

See [architecture](architecture.md#replace-or-remove-the-demo) for replacing the synchronous demo repository with asynchronous persistence and removing the remaining example UI.
