# OpenAPI and Scalar

The same oRPC procedures serve the browser over RPC, direct Server Component calls, and a public REST API. `OpenAPIReferencePlugin` generates the OpenAPI 3.1.1 document and Scalar page on request from the implemented contract. The native MCP endpoint derives its tools from the same document and dispatches calls through the REST adapter. No specification file, generation command, separate backend, or database is required. See [MCP usage](mcp.md) for agent connections and the development Inspector.

## Endpoints

| Endpoint | Input and behavior |
| --- | --- |
| `GET /api/docs` | Public, interactive Scalar reference; linked from the shared header and homepage. |
| `GET /api/openapi.json` | Generated specification, titled with the site name from `apps/web/src/site.ts` followed by **API**, version **1.0.0**. Both values are set in `apps/web/src/lib/api-info.ts`. |

Each procedure adds its own endpoint under `/api`. Invalid inputs return 400; invalid procedure outputs return 500. REST and RPC request bodies larger than 64 KB are rejected with 413 before parsing. Path parameters belong only in the URL: on any route with a path parameter, such as `{id}`, and oRPC's default compact input, repeating that key in the query or body returns 400, even when the values match. This includes bracket keys such as `id[0]`. On those routes, a malformed body also returns 400 before any mutation. This guard in `createOpenApi` (`apps/web/src/lib/openapi.ts`) stops oRPC's compact input merge from replacing the path value. Routes with `inputStructure: "detailed"` keep path parameters and the query apart, so the guard skips them.

<!-- demo:start -->
The task demo adds these endpoints:

| Endpoint | Input and behavior |
| --- | --- |
| `GET /api/v1/tasks?status=all` | Required status: `all`, `active`, or `completed`; returns 200. |
| `POST /api/v1/tasks` | JSON `{ "title": "Build a feature" }`; returns the new task with 201. |
| `PATCH /api/v1/tasks/{id}` | JSON `{ "completed": true }`; returns the updated task with 200, or `NOT_FOUND` with 404. |
| `PATCH /api/v1/tasks/{id}/title` | JSON `{ "title": "Refine the feature" }`; returns the updated task with 200, preserving ID and completion, or `NOT_FOUND` with 404. |
| `DELETE /api/v1/tasks/{id}` | No body; returns the deleted task with 200, or `NOT_FOUND` with 404 if it no longer exists. |

Creation and title-editing inputs are trimmed before the normalized 1–120-character constraint is checked.

**The demo is public and shared.** Scalar's request client executes real reads and writes against the same process-local repository as the workbench. Data resets when the server process restarts and differs between server instances. The list keeps at most 100 tasks; each create beyond that evicts the oldest task. Scalar mutations do not invalidate another page's TanStack Query client; reload or refetch an open workbench to see them.

Title editing uses RPC `tasks.updateTitle` and MCP `updateTaskTitle`, with the same REST procedure and validation. The workbench's pencil opens an inline editor: Enter or **Save** submits, while Escape or **Cancel** discards the edit. Successful edits invalidate every task filter; failed edits retain the title draft and the separate new-task draft. Editing changes only the title, preserving ID and completion. The last successful title write wins; the demo has no revision-based conflict detection.

Deletion uses the same procedure through RPC (`tasks.delete`), REST, and MCP (`deleteTask`). A repeated delete returns `NOT_FOUND`. The workbench removes the row after success and invalidates every task filter. A failed deletion keeps the row and any unsaved draft for retry. If another client already removed the task, cancel any open edit and refresh or reload the stale view.

The browser workbench now lives at `/playground#tasks`. The separate [MCP App](mcp-apps.md) uses the same generated tools and contracts through its host's connection. Its HTML resource and UI metadata do not change REST inputs, response bodies, or OpenAPI schemas.
<!-- demo:end -->

## Add or change a procedure

For a small, complete example, see `apps/web/src/testing/fixture-api.ts`. It holds a contract and its implementation in one file, with a query input, a JSON body, a path parameter, a custom success status, and a typed error. The tests use it, so copy from it rather than change it, and split the copy into `@repo/contracts` and `@repo/api`. After `pnpm remove-demo`, the larger task demo is still in Git history.

1. Define browser-safe ArkType schemas and an `oc` contract in `@repo/contracts`. Add `.route({ method, path, operationId, tags, summary, description })`, stable unique operation IDs, declared errors, and the appropriate success status. Paths are relative to `/api`, such as `/v1/projects`; the generated document uses `/api` as its server URL.
2. Add examples with a `.route({ spec: operation => ... })` callback that preserves generated schemas. Do not replace the operation with a hand-written schema that can drift from runtime validation.
3. Implement the contract in `@repo/api`, using request context for data access and shared mutation invalidation. Adding the implementation to the router exposes it through RPC, REST, and generated MCP tools; no separate business logic is needed for each transport.
4. Export any newly needed HTTP verb from `apps/web/src/app/api/[...rest]/route.ts` (currently GET, POST, PATCH, and DELETE). The REST adapter already rejects a query or body key that repeats a path parameter, so new routes need no guard of their own.
5. Test the specification mapping and real HTTP validation. Put these tests in `apps/web/src/lib`, like `openapi.test.ts` and `mcp.test.ts`: they build the REST handler and the MCP tools from the fixture router and send real requests to them. Review `/api/openapi.json` and exercise the endpoint in Scalar. Its operation ID also becomes the generated MCP tool name; check its arguments and behavior in the development Inspector.
6. Describe the API. The title and version are in `apps/web/src/lib/api-info.ts`, which the tests read too. Add a description and the tag descriptions to the `createOpenApi` call at the end of `apps/web/src/lib/openapi.ts`. Use the same tag names as the contract's `.route({ tags })`; a tag that is not listed here still works, but has no description in Scalar:

   ```ts
   const openApi = createOpenApi(router, {
     info: { ...apiInfo, description: "What this API does." },
     servers: [{ url: "/api" }],
     tags: [{ name: "Projects", description: "Create and list projects." }],
   });
   ```

The converter in the web package adapts oRPC's ArkType integration, as written for oRPC 1.15.4; recheck it after oRPC upgrades. Input schemas use `.in`, and response schemas use `.out`. For a trimmed string, the input JSON Schema describes a string while the output describes the normalized length bounds; endpoint descriptions explain the additional normalization rules. Arbitrary refinements that ArkType cannot represent, and defined non-ArkType schemas, fail generation instead of silently producing an empty schema. Procedures with no input or output schema remain supported.

All oRPC packages are pinned to the same 1.x version (see `apps/web/package.json`). Use the matching [stable OpenAPI guide](https://v1.orpc.dev/docs/openapi/openapi-specification) and [reference-plugin documentation](https://v1.orpc.dev/docs/openapi/plugins/openapi-reference) when extending or upgrading the integration.

## Call a procedure from the app

Pages and components call procedures by their router names, with types from the contract and no fetch code. The examples below assume a `projects` contract with `list` and `create` procedures, added as `projects: projectsContract` to `contract` in `@repo/contracts`.

In a Server Component, `getServerApiClient()` from `apps/web/src/lib/server-api.ts` calls the procedure in the same process, with the same validation and request context as the HTTP routes:

```tsx
import { connection } from "next/server";
import { getServerApiClient } from "@/lib/server-api";

export async function ProjectList() {
  // Data that changes at run time must not become a build-time snapshot.
  await connection();
  const projects = await getServerApiClient().projects.list();
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}
```

Render it beneath `<Suspense>`; see [cache ownership](architecture.md#cache-ownership).

In a Client Component, `orpc` from `apps/web/src/lib/orpc.ts` calls `/api/rpc` and builds TanStack Query options:

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function NewProjectButton() {
  const queryClient = useQueryClient();
  const projects = useQuery(orpc.projects.list.queryOptions());
  const create = useMutation(
    orpc.projects.create.mutationOptions({
      // Refetch every projects query after a successful write.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
    }),
  );
  return (
    <button type="button" onClick={() => create.mutate({ name: "New project" })}>
      Add project ({projects.data?.length ?? 0})
    </button>
  );
}
```

To render the first data on the server and reuse it after hydration, fill `getServerQueryClient()` from the same server module through `createTanstackQueryUtils(getServerApiClient())`, and pass `dehydrate(queryClient)` to a `HydrationBoundary` around the Client Component. Use translated text from `@repo/i18n` instead of the literal strings above.

## Scalar renderer and caching

`scalarScriptUrl` in `apps/web/src/lib/api-info.ts` pins Scalar's standalone browser bundle on jsDelivr by an exact `@scalar/api-reference` version. `createOpenApi` passes it to the reference plugin as `docsScriptUrl`.

There is no local `@scalar/api-reference` dependency, bundle-copy script, or generated Scalar asset. Loading the interactive reference requires access to jsDelivr; the JSON specification and REST API do not depend on that CDN. Upgrading oRPC does not change the renderer version. Renovate updates the version in `scalarScriptUrl`. To upgrade Scalar by hand, change the version there and run `pnpm verify`; the unit and browser tests import the URL, so they need no edits. Follow Scalar's [renderer-pinning guidance](https://scalar.com/products/api-references/integrations/nextjs#pin-the-browser-renderer).

Scalar uses its responsive layout and hash navigation with the API title followed by **Reference**, such as **My App API Reference**. External fonts, telemetry, and Scalar Agent are disabled. Requests go directly to the application's origin; no request proxy or cross-origin API configuration is provided.

RPC, REST, documentation, and specification responses use `Cache-Control: no-store`. The service worker bypasses every `/api/` request and external resources, so it neither caches the documentation/API responses nor precaches Scalar. Offline documentation is not supported. The browser's ordinary HTTP caching of the CDN bundle is separate from the service worker.

## Authentication, persistence, and removal

<!-- demo:start -->
To remove the task demo, run `pnpm remove-demo`. It leaves an empty contract, an OpenAPI document with no paths, and a working Scalar reference. See [Remove the demo](remove-demo.md). If you instead remove REST by hand while the demo is present, also remove that command; see [Remove only part of the demo](remove-demo.md#remove-only-part-of-the-demo).

<!-- demo:end -->
- When adding authentication or persistence, initialize the authorized context in the RPC, REST, and MCP Route Handlers and the direct server client. Keep authorization in the shared procedures/repository so every transport enforces it. Supply cache invalidation consistently across these entry points if server data becomes cached, and choose which contracts to expose in public docs and MCP discovery.
- To remove REST and documentation entirely, first remove or replace the dependent MCP bridge as described in [MCP removal](mcp.md#add-change-or-remove-tools). Then remove the REST catch-all, `apps/web/src/lib/openapi.ts` and its tests, `apps/web/src/lib/api-info.ts` and its entry in the `paths` filter of `.github/workflows/docker.yml`, the shared header and homepage stack-card **API docs** links, and related browser checks. Remove `@orpc/openapi`, `@orpc/arktype`, and their now-unused direct peers from the web package, then regenerate the lockfile. Retain RPC and its shared contracts if the application still uses them.

See [architecture](architecture.md#data-access-and-persistence) for the request context and asynchronous persistence.
