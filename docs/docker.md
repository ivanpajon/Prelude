# Docker workflows

Prelude provides a production Compose stack by default and a separate development stack using Compose Watch. The production image contains Next.js standalone output, static assets, the generated Serwist worker, and the dependencies needed at runtime. Development retains the tools needed for Turbopack and the MCP Inspector.

The task repository remains shared, process-local demo data. Rebuilding or restarting a container resets it; multiple containers do not share it. Docker adds no database or persistence layer.

## Prerequisites and commands

Use a current Docker Desktop with Linux containers, or Docker Engine with BuildKit and the Compose plugin **2.32.2 or later**. The Dockerfile uses the current stable Dockerfile frontend, including `COPY --parents`. Start the Docker engine before running these commands. The `pnpm` shortcuts use the project's pinned pnpm **12.6.0**; the images install their own dependencies with Node **26.10.0**. A host dependency installation is not needed just to start a stack.

From the repository root:

```sh
# Production application and PWA, http://localhost:3001.
pnpm stack:prod

# Development with source synchronization, http://localhost:3000.
pnpm stack:dev
```

Keep production and development on different ports. A production service worker belongs to its browser origin and can continue controlling it when that port is reused for development. If an origin was reused, unregister its service worker in browser developer tools.

The development Inspector is available at `http://localhost:3000/api/mcp/inspector`; its embedded UI uses port `6274` and its App sandbox uses `6275`. All three published development ports are restricted to the host's loopback interface. The development processes listen on all interfaces inside the container so Docker can forward those loopback ports. Inspector authentication stays enabled. Production exposes neither the Inspector process nor its pages, including nested Inspector paths.

## Production

`compose.yaml` is the default, so ordinary `docker compose` commands select production:

```sh
docker compose ps
docker compose logs --follow
docker compose up --build --detach --wait
docker compose down
```

`pnpm stack:prod` builds and starts containers in the background. Use `docker compose ps` to check readiness or the `up --wait` form above to wait for a healthy server before continuing.

Rebuild after source or dependency changes. To recreate containers after changing runtime environment values, run `docker compose up --detach --wait` again; an ordinary `restart` retains the container's old environment.

Both stacks use the same localization policy as native workflows: explicit `/en` and `/es` URLs by default, with the homepage switch enabling unprefixed URLs for a visitor. Changing `routingSettings.defaultMode` or `routingSettings.demoEnabled` is a source change and requires rebuilding the production image. These settings are not Compose environment variables. Development Watch synchronizes their source changes. See [localization](i18n.md) for fixed policies, cookie scope across ports, and cache behavior.

The healthcheck requests the existing `/offline` page using Node's built-in HTTP client. It confirms that the web server responds without creating or changing demo tasks. It is a liveness check, not a database or external-service check.

The production runtime uses the official **Distroless Node 26 Debian 13 nonroot** image, pinned by digest. It has no shell or package manager. The builder and development stages use **Node 26.10.0 on Debian 13 slim**, keeping the Node version, architecture, and libc family aligned. The runtime starts the generated `apps/web/server.js` directly as a nonroot user.

The image includes the complete traced standalone directory, `.next/static`, and `public`. The build compiles the self-contained MCP App first, builds Next.js, and then runs Serwist before copying the finished public assets; copying public before Serwist would omit the generated worker. Explicit Next.js tracing includes `.generated/mcp-apps/tasks.html` for `/api/mcp`, so resource reads work in the runtime without a compiler or source tree. The widget stays outside `public`. Native dependencies and internationalization support are preserved. Runtime cache directories remain writable by the application user.

The Docker builder sets `NEXT_OUTPUT_STANDALONE=true`. Native `pnpm build` and `pnpm start` retain their existing behavior. Container build outputs and caches are separate from the host's `.next` directory.

## Development and Watch

The development file is standalone; do not combine it with the production file using multiple `-f` flags:

```sh
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs --follow
docker compose -f compose.dev.yaml down
```

`pnpm stack:dev` runs Compose Watch in the foreground; use Ctrl+C to stop it and `down` to remove its containers and network. Edit files on the host: Watch synchronizes source into the container and Turbopack refreshes the application. The managed widget builder watches its own sources, shared UI sources, and shared localization catalogs inside the container; reopen Inspector's App preview to load rebuilt HTML. Dependency manifests, the lockfile, package-manager configuration, and Dockerfile changes trigger a rebuild. Next.js, PostCSS, TypeScript, development-launcher, and widget-build-script changes synchronize and restart the service. Restart Compose after editing a Compose file or its environment values. Linux dependencies and generated output stay inside Docker; Windows or macOS `node_modules` are never mounted over them.

Watch synchronization is **one way, from host to container**. Run dependency updates, workspace customization, and source-generating commands on the host so their results remain in Git. For example:

```sh
pnpm install --frozen-lockfile
pnpm --dir packages/ui exec shadcn add dialog
pnpm customize --name my-app --scope "@acme"
```

Stop Watch before changing workspace names or upgrading the runtime/package manager, then start it again. Commit changed manifests, generated source, and the lockfile together. Edits made only inside a container are not copied back and can disappear when it is recreated.

Host installation also supplies editor types, Git hooks, and native test commands. It does not replace the frozen installation performed inside the image. Docker build commands use package directories rather than hard-coded workspace scopes, so `pnpm customize` remains compatible.

Next.js explicitly allows `127.0.0.1` as a development origin so browser HMR connections work when the container listens on `0.0.0.0`. This grants no remote development origins. Development does not register a service worker.

## Environment and ports

No environment file is required. For optional Compose configuration, copy the root `.env.example` to `.env` and edit the values you need. Compose reads this file for interpolation; only variables explicitly passed by the Compose configuration reach the application. Host shell variables take precedence.

| Variable | Default and purpose |
| --- | --- |
| `PROD_PORT` | `3001`; production port published on the host. |
| `PROD_HOST` | `127.0.0.1`; interface used to publish the production port. |
| `DEV_PORT` | `3000`; development application port. |
| `MCP_INSPECTOR_PORT` | `6274`; development Inspector UI port. |
| `MCP_SANDBOX_PORT` | `6275`; development Inspector App sandbox port. |
| `MCP_ENABLED` | Enabled unless set to `false`; controls MCP tools/resources and `/playground` MCP actions at runtime. |
| `MCP_ALLOWED_ORIGINS` | Empty by default; comma-separated exact browser origins allowed at the production MCP HTTP endpoint. |

Choose three distinct free application, Inspector, and sandbox ports. All are published only on host loopback and retain the same numbers inside and outside the container, keeping target and sandbox URLs reachable by both the browser and Inspector. The additional internal app-origin helper remains dynamically allocated and unpublished. Update browser bookmarks and external MCP client URLs when changing ports. Production publishes only the application port and runs no Inspector or sandbox service.

The managed launcher builds the widget, waits for Next.js to bind its fixed port, and then starts Inspector. This prevents Inspector's OS-assigned auxiliary listener from claiming a custom application port during startup or a watched container rebuild.

The root `.env` configures Docker Compose. Native development uses the application's environment, such as `apps/web/.env.local`; those local files are excluded from the Docker build context. Do not put secrets in Docker build arguments, image layers, or committed environment files.

`MCP_ENABLED` and `MCP_ALLOWED_ORIGINS` are read at runtime: the same production image can run with different values. Origin checks do not provide authentication. The playground's same-origin action bridge works without adding its own origin to the HTTP endpoint's allowlist. A compatible MCP Apps host proxies widget tool calls through its existing MCP connection. See [MCP configuration](mcp.md) and [MCP Apps](mcp-apps.md) for native clients, direct browser clients, and authorization boundaries.

Future `NEXT_PUBLIC_*` variables are embedded into browser code during the Next.js build. Declare and pass required public build arguments deliberately, and rebuild the image when they change; setting them only on a running container will not update the browser bundle. Keep server secrets in runtime environment configuration.

## Concurrent stacks and projects

Compose normally names a project after its directory. Neither file fixes that name, so the two shortcut commands select the same Compose project in one checkout. Stop that stack before switching modes, or give each mode a separate project name to run both:

```sh
docker compose --project-name prelude-prod up --build --detach --wait
docker compose --project-name prelude-dev -f compose.dev.yaml up --build --watch
```

Use the same project name and file for subsequent commands:

```sh
docker compose --project-name prelude-prod down
docker compose --project-name prelude-dev -f compose.dev.yaml down
```

For multiple checkouts, choose unique host ports as well as project names. Set `COMPOSE_PROJECT_NAME` in each checkout's optional root `.env`, or supply `--project-name` explicitly. Two development stacks need different `DEV_PORT`, `MCP_INSPECTOR_PORT`, and `MCP_SANDBOX_PORT` values. Production uses port `3000` internally; change `PROD_PORT` to select its host port.

An alternative environment file can describe another instance without editing the default file:

```sh
docker compose --env-file .env.second --project-name second-dev -f compose.dev.yaml up --build --watch
```

## Deploying on a server

The default production binding is appropriate for local use and a reverse proxy running on the same host. Set `PROD_HOST=0.0.0.0` only when the deployment needs the port reachable through other interfaces. Configure the server's network access and HTTPS ingress for the intended audience.

Use HTTPS for a deployed PWA; browsers permit the local loopback exception during development. Preserve the public request Host when forwarding to Next.js so same-origin Server Actions can verify it, and preserve streaming responses. TLS termination, public DNS, authentication, persistence, and deployment-provider configuration remain the operator's choices.

The demo's REST, RPC, and MCP mutations are public. Set `MCP_ENABLED=false` if MCP should be hidden; this does not disable the other transports. Replace demo data access and add application authorization before adapting it to private data.

## Logs and diagnostics

Use Compose logs for both startup errors and runtime failures. The production image deliberately has no `sh`, `bash`, `curl`, npm, or pnpm. Node is available for targeted diagnostics:

```sh
docker compose exec web /nodejs/bin/node --version
docker compose exec web /nodejs/bin/node -e "console.log({ node: process.version, uid: process.getuid() })"
```

The development image contains a shell and the development tools. Diagnose package installation and compiler failures there or in the builder rather than installing tools into a running production container.

For a clean rebuild of this stack, use `docker compose build --no-cache` followed by `docker compose up --detach --wait`. The build context excludes host dependencies, build output, tool downloads, local environment files, and test reports. Persistent engine-wide cache deletion is not required for a normal rebuild.

## Verification and measurements

With Docker running and the host test dependencies installed:

```sh
pnpm exec playwright install chromium
pnpm test:stack
```

The Docker acceptance workflow complements `pnpm verify`; it is separate so the ordinary native checks do not require Docker. It works in a temporary project copy with isolated Compose resources, leaving the checkout's source unchanged. Check `test-results/stack/report.json` for completed scenarios, platform information, image sizes, and timings. A completed native build alone does not verify the packaged container.

The report compares Distroless and the `production-slim` measurement target using identical standalone artifacts. Runtime samples use the same two-CPU, 1-GiB limits, with three samples by default; `pnpm test:stack --samples 5` changes the sample count. Each sample records HTTP readiness, process RSS, and a small mixed HTML/API workload with latency percentiles. These measurements describe this workload on the reported machine, not a general performance guarantee.

Image sizes distinguish the unpacked filesystem, Docker's image-store accounting, and the sum of gzip-compressed OCI layers. Unpacked bytes come from a fresh, stopped container's `SizeRootFs` minus `SizeRw`; Docker's image `Size` can also include compressed storage with the containerd backend. Compressed layer bytes exclude registry metadata and do not estimate network transfer time or account for layers already present on another machine. Smaller download size does not establish faster application execution.

The slim target reuses the common compilation stage for its cold assembly, source-change, and restore builds. Those timings measure additional runtime assembly, not a second independent compilation. The unchanged-build checks require cached compilation; the production source-change check requires a new compilation with cached dependencies.

The initial production build uses a dedicated empty Buildx builder, including a fresh pnpm store and Next.js cache. It does not reset Docker Desktop or measure network transfer, so it is not a fresh-machine installation benchmark.

Container verification covers rendering, static assets and image optimization, REST/RPC/MCP access, runtime MCP enablement, absent production Inspector routes, Temporal/Intl, writable caches, PWA offline behavior, and graceful shutdown. MCP App checks include the traced HTML resource and a working host-browser preview through the published development sandbox. Development checks cover source synchronization, managed Inspector access, rebuilds, and independent host/container dependencies. The [recorded measurements](docker-measurements.md#playground-and-mcp-app-run) distinguish the widget-containing image from the historical baseline. Rerun acceptance when the source or environment changes; image size and latency vary across machines.

When upgrading Node, update both pinned image references in `Dockerfile` together with the repository runtime baseline, and verify the actual Node versions in both images. Update the Dockerfile's pnpm version with `packageManager`. Rerun native and container acceptance after either change. The packaging follows the official [Distroless Node runtime](https://github.com/GoogleContainerTools/distroless/tree/main/nodejs), [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) documentation.
