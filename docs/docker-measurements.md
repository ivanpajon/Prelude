# Docker measurement baseline

Measured on **2026-09-29** with Docker Desktop **4.91.0**, Engine **29.8.0**, Compose **5.5.1**, and the Linux **amd64** engine on Windows/WSL2. The engine had 20 CPUs and 31.47 GiB available. Each production container was limited to **2 CPUs and 1 GiB**; development acceptance used 2 CPUs and 4 GiB. Both runtime images used Node **26.10.0**, ICU **78.3**, Sharp **0.35.4**, and UID **65532**.

The successful `pnpm test:stack` run was `prelude-stack-39a77802`, from 23:50:56 UTC on September 28 to 00:00:42 UTC on September 29. It built both targets from the same source and verified matching application-artifact SHA-256 hashes: `f493bd6e35c43f44a322eefec047132fd032e9460519ef4e8885f16ef30b8c6b`. The measurements below describe this machine and demo workload, not a production capacity estimate.

## Image footprint

MB below means 1,000,000 bytes.

| Measurement | Distroless production | Node slim baseline | Reduction |
| --- | ---: | ---: | ---: |
| Gzip-compressed OCI layers | 74.31 MB | 99.74 MB | 25.5% |
| Unpacked filesystem | 232.17 MB | 316.41 MB | 26.6% |
| Docker image-store accounting | 306.46 MB | 416.14 MB | 26.4% |

Compressed sizes sum unique gzip layers and exclude manifest/configuration metadata. They do not measure network transfer. Unpacked sizes were measured from fresh stopped containers as `SizeRootFs - SizeRw`: **232,165,376** and **316,407,808** bytes. The images remained unchanged during those probes.

Docker's containerd store retains compressed and unpacked data, so `docker image inspect` alone does not provide an unpacked-only measurement on this engine. The acceptance helper records these values separately. See Docker's [container size fields](https://docs.docker.com/reference/cli/docker/inspect/#inspect-the-size-of-a-container--s---size) and [containerd storage explanation](https://docs.docker.com/engine/storage/containerd/#disk-space-usage).

## Build cache behavior

| Build | Time | Dependency installation | Next.js compilation |
| --- | ---: | --- | --- |
| Cold production build | 75.09 s | Executed | Executed |
| Unchanged production rebuild | 5.65 s | Cached | Cached |
| Source-only production rebuild | 23.75 s | Cached | Executed |
| Restore original production source | 5.90 s | Cached | Cached |
| Slim runtime assembly after cold build | 10.70 s | Cached | Cached |
| Unchanged slim rebuild | 6.82 s | Cached | Cached |
| Slim assembly after source change | 10.18 s | Cached | Cached |

The cold build used a dedicated empty Buildx builder, including a fresh pnpm store and Next.js cache. It was not a fresh Docker Desktop installation or a network benchmark. The slim target reused the common application build; its assembly timings do not represent an independent cold compilation. Source-only changes reused dependency installation as required.

The development image built in **80.61 s** using the populated dependency layer. A watched root-manifest change rebuilt and restored readiness in **103.82 s**. Its dependency installation reused the pnpm store and took 2.2 s; image export/import accounted for about 84.6 s. These development timings include Docker Desktop's image transfer overhead.

## Runtime samples

Each image was started three times. Each sample made six warm-up requests followed by 50 requests, split equally between `/` and `/api/v1/tasks?status=all`, at concurrency four. Tables report the median of the three per-run measurements; percentile ranges are included where useful. Other heavy test suites were stopped during measurement.

| Measurement | Distroless production | Node slim baseline |
| --- | ---: | ---: |
| Compose command to first successful API response | 1.635 s | 1.491 s |
| Container start to first successful API response | 1.137 s | 1.046 s |
| First HTML request | 554.84 ms | 544.80 ms |
| Idle application RSS after readiness and first HTML | 162.18 MiB | 163.14 MiB |
| Application RSS after load | 175.18 MiB | 173.44 MiB |
| HTML p50 | 67.78 ms | 64.60 ms |
| HTML p95 | 127.29 ms | 121.21 ms |
| API p50 | 13.17 ms | 13.90 ms |
| API p95 | 32.32 ms | 43.53 ms |

HTML p95 ranged from 120.00–137.49 ms for Distroless and 104.66–130.13 ms for slim. API p95 ranged from 23.49–43.41 ms and 29.41–48.25 ms respectively. RSS sums application Node processes, excludes the measurement process, and is not a peak-memory measurement. The readiness probe ran every 100 ms, so differences around that interval need a finer follow-up before attributing them to the runtime image.

A follow-up investigated the initial 91-ms median readiness difference with **five interleaved starts per image** and **25-ms polling**, retaining the same CPU/memory limits and checking matching application and Node-binary hashes. Container-to-API readiness was **1,033 ms** median for Distroless (1,014–1,040 ms) and **1,013 ms** for slim (993–1,045 ms). First-HTML medians were 554.15 and 539.70 ms, also with overlapping ranges. The remaining 20-ms readiness difference is below one polling interval; this small local sample does not establish a meaningful runtime regression or speed improvement. Its separate raw results are in `test-results/stack/startup-followup.json`. The measured footprint reduction is the clear benefit.

## Functional acceptance

The complete container run passed:

- Six production browser scenarios on each runtime: standalone rendering, optimized images, RPC writes, REST/MCP consistency, modern and legacy MCP, the homepage playground, Scalar, PWA cache exclusions, offline fallback, and approval-driven worker activation.
- Three development scenarios: no service-worker registration, authenticated embedded Inspector operation, and application/shared-style Fast Refresh preserving a draft.
- Runtime MCP disablement and re-enablement without rebuilding, production Inspector 404s, nonroot cache writes, native Temporal/Intl, manifest-triggered rebuild, graceful shutdown, released ports, and unchanged host source.
- Matching runtime artifacts, smaller compressed and unpacked footprints, cached unchanged builds, and dependency-layer reuse after source edits.

Separately, a disposable checkout renamed the scope to `@stack-check`, refreshed its lockfile, and passed a frozen Docker build with homepage, OpenAPI, service worker, and MCP-to-REST mutation checks. The native workflow passed frozen installation and `pnpm verify`: 208 unit/component tests, 2 development browser scenarios, 43 production browser scenarios, production build, and service-worker restoration from Turborepo cache. The unpacked-size reporting correction then passed three additional unit tests and a real-image probe; the 29 launcher tests were rerun successfully alongside them.

The full run and logs are generated locally in ignored `test-results/stack/`. Re-run `pnpm test:stack` to measure another machine. ARM64 was not exercised in this run. Scalar rendering tests require access to its pinned CDN bundle.
