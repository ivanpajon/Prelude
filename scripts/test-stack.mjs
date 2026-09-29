import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { measureUnpackedImageSize } from "./stack-image-size.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { values } = parseArgs({
  options: { samples: { type: "string", default: "3" }, help: { type: "boolean" } },
});
if (values.help) {
  console.log(
    "pnpm test:stack [--samples 3]\nBuild and exercise disposable Docker stacks; write test-results/stack/report.json.",
  );
  process.exit(0);
}
const samples = Number(values.samples);
assert(Number.isInteger(samples) && samples >= 1 && samples <= 10, "--samples must be 1–10");
const project = `prelude-stack-${randomUUID().slice(0, 8)}`;
const reportDirectory = path.join(root, "test-results", "stack");
await mkdir(reportDirectory, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), `${project}-`));
const context = path.join(temporary, "context");
const builder = `${project}-builder`;
const ownedProjects = new Set();
const ownedImages = new Set();
const ownedImageIds = new Set();
const imageLabel = `dev.prelude.stack.run=${project}`;
let builderCreated = false;
const controller = new AbortController();
const stop = () => controller.abort(new Error("Stack verification interrupted"));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const report = {
  project,
  startedAt: new Date().toISOString(),
  status: "running",
  methodology: {
    samples,
    runtime: { cpus: 2, memory: "1g" },
    development: { cpus: 2, memory: "4g" },
    requests: { warmup: 6, count: 50, concurrency: 4, routes: ["/", "/api/v1/tasks?status=all"] },
    build:
      "Dedicated empty Buildx builder; host Docker engine resource defaults. Production includes the common cold build. Slim cold assembly reuses exactly those artifacts; its time is not a second full cold build.",
    size: "Unpacked bytes are SizeRootFs minus SizeRw from a never-started, network-disabled measurement container. Raw rootfs/writable values and image inspect Size (image-store bytes, potentially packed plus unpacked) are retained separately. Compressed bytes sum unique gzip OCI layers, excluding config/manifest metadata; not measured network transfer.",
    readiness:
      "First successful task API response after compose up, with container-start-relative and command-relative timing; first HTML request reported separately.",
    rss: "Sum of Node application processes' VmRSS from /proc, excluding the measurement process.",
  },
  builds: {},
  images: {},
  acceptance: {},
};

async function checkpoint() {
  await writeFile(
    path.join(reportDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function redact(text) {
  return text.replace(
    /(?:MCP_INSPECTOR_API_TOKEN=|Auth token: )[\da-f]+/gi,
    "[Inspector token omitted]",
  );
}

async function terminateOwnedTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        shell: false,
      });
      killer.once("error", reject);
      killer.once("exit", resolve);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

async function command(
  executable,
  args,
  { env = {}, cwd = root, log, timeout = 1_200_000, cleanup = false } = {},
) {
  if (!cleanup) controller.signal.throwIfAborted();
  const started = performance.now();
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const abort = () => {
    void terminateOwnedTree(child).catch(() => child.kill());
  };
  const timer = setTimeout(abort, timeout);
  if (!cleanup) controller.signal.addEventListener("abort", abort, { once: true });
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    output = redact(output);
    if (log) await writeFile(path.join(reportDirectory, log), output);
    assert.equal(
      status,
      0,
      `${executable} ${args.slice(0, 4).join(" ")} failed:\n${output.slice(-12_000)}`,
    );
    return { output, ms: performance.now() - started };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", abort);
  }
}

const docker = (args, options) => command("docker", args, options);

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function copyContext() {
  const listed = await command("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const files = [...new Set(listed.output.split("\0").filter(Boolean))].filter(
    (file) =>
      !/(^|\/)(node_modules|\.pnpm-store|\.next|\.turbo|\.git|\.tools|\.agents|\.codex|coverage|test-results|playwright-report|output)(\/|$)/.test(
        file,
      ) &&
      !/(^|\/)\.env(?:\.|$)/.test(file) &&
      !/public\/sw\.js(?:\.map)?$/.test(file),
  );
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    const source = path.resolve(root, file);
    const target = path.resolve(context, file);
    assert(source.startsWith(root) && target.startsWith(`${context}${path.sep}`));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    digest.update(file).update(await readFile(source));
  }
  await writeFile(path.join(context, ".stack-owner"), project);
  report.source = { files: files.length, sha256: digest.digest("hex") };
  return files;
}

async function sourceDigest(files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update(await readFile(path.join(root, file)));
  return hash.digest("hex");
}

async function build(target, label, extra = []) {
  const tag = `${project}:${target}`;
  console.log(`Stack: building ${label}`);
  const result = await docker(
    [
      "buildx",
      "build",
      "--builder",
      builder,
      "--progress=plain",
      "--provenance=false",
      "--target",
      target,
      "--tag",
      tag,
      "--label",
      imageLabel,
      "--load",
      ...extra,
      context,
    ],
    { log: `build-${label}.log` },
  );
  const dependencySteps = [
    ...result.output.matchAll(/(#\d+) \[dependencies[^\n]*RUN[^\n]*pnpm install/g),
  ].map((match) => match[1]);
  const dependencyCacheHit = dependencySteps.some((step) =>
    result.output.includes(`${step} CACHED`),
  );
  const compilationSteps = [
    ...result.output.matchAll(/(#\d+) \[build[^\n]*RUN[^\n]*pnpm --dir apps\/web build/g),
  ].map((match) => match[1]);
  const compilationCacheHit = compilationSteps.some((step) =>
    result.output.includes(`${step} CACHED`),
  );
  ownedImages.add(tag);
  ownedImageIds.add(JSON.parse((await docker(["image", "inspect", tag])).output)[0].Id);
  const metric = {
    ms: result.ms,
    dependencyCacheHit,
    compilationCacheHit,
    log: `build-${label}.log`,
  };
  report.builds[label] = metric;
  await checkpoint();
  return metric;
}

// OCI exports can be large. Read tar headers and only the small JSON documents.
async function ociSize(archive) {
  const handle = await open(archive, "r");
  try {
    const entries = new Map();
    const header = Buffer.alloc(512);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(header, 0, 512, position);
      if (bytesRead < 512 || header.every((byte) => byte === 0)) break;
      const text = (start, length) =>
        header
          .subarray(start, start + length)
          .toString()
          .replace(/\0.*$/s, "");
      const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/").replace(/^\.\//, "");
      const size = Number.parseInt(text(124, 12).trim(), 8) || 0;
      entries.set(name, { position: position + 512, size });
      position += 512 + Math.ceil(size / 512) * 512;
    }
    async function json(name) {
      const entry = entries.get(name);
      assert(entry && entry.size < 5_000_000, `Missing or oversized OCI metadata: ${name}`);
      const bytes = Buffer.alloc(entry.size);
      await handle.read(bytes, 0, bytes.length, entry.position);
      return JSON.parse(bytes.toString());
    }
    const layers = new Map();
    async function visit(document) {
      for (const descriptor of document.manifests ?? []) {
        await visit(await json(`blobs/${descriptor.digest.replace(":", "/")}`));
      }
      for (const layer of document.layers ?? []) {
        assert(
          layer.mediaType.endsWith("+gzip"),
          `Expected gzip OCI layer, got ${layer.mediaType}`,
        );
        layers.set(layer.digest, layer.size);
      }
    }
    await visit(await json("index.json"));
    assert(layers.size > 0, "OCI export contains no image layers");
    return {
      gzipLayerBytes: [...layers.values()].reduce((sum, size) => sum + size, 0),
      layerCount: layers.size,
    };
  } finally {
    await handle.close();
  }
}

const nodeBin = (target) => (target === "production" ? "/nodejs/bin/node" : "/usr/local/bin/node");
const inspectRuntimeSource = `
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const assert=require('node:assert/strict');
assert.notEqual(process.getuid(),0,'Runtime must not use root');
assert.equal(Intl.DateTimeFormat.supportedLocalesOf(['en','es','ja','ar']).length,4);
assert.match(new Intl.DateTimeFormat('es',{month:'long',timeZone:'Europe/Madrid'}).format(new Date('2026-01-01')),/enero/);
assert.equal(Temporal.Instant.from('2026-01-01T00:00:00Z').toZonedDateTimeISO('Europe/Madrid').hour,1);
const fromApp=require('node:module').createRequire('/app/apps/web/server.js');
for(const dependency of ['tsdown','@tailwindcss/cli','@modelcontextprotocol/inspector']) {
 assert.throws(()=>fromApp.resolve(dependency),{code:'MODULE_NOT_FOUND'},dependency+' must not ship in the runtime');
}
const appHtml=fs.readFileSync('/app/apps/web/.generated/mcp-apps/tasks.html','utf8');
assert(appHtml.includes('<!--PRELUDE_MCP_APP_CONFIG-->'),'Runtime must contain the generated MCP App HTML');
const fromNext=require('node:module').createRequire(fromApp.resolve('next/package.json'));
const sharp=fromNext('sharp'); assert(sharp.versions.vips);
const cache='/app/apps/web/.next/cache'; fs.mkdirSync(cache,{recursive:true});
const probe=path.join(cache,'stack-permission-probe'); fs.writeFileSync(probe,'ok'); fs.unlinkSync(probe);
const hash=crypto.createHash('sha256');
function walk(dir){for(const name of fs.readdirSync(dir).sort()){
 const file=path.join(dir,name), relative=path.relative('/app',file);
 if(relative.replaceAll('\\\\','/').includes('.next/cache')) continue;
 const info=fs.lstatSync(file); hash.update(relative);
 if(info.isSymbolicLink()) hash.update(fs.readlinkSync(file));
 else if(info.isDirectory()) walk(file); else hash.update(fs.readFileSync(file));
}}
walk('/app');
console.log(JSON.stringify({uid:process.getuid(),node:process.version,icu:process.versions.icu,sharp:sharp.versions.sharp,nativeTemporal:true,mcpApp:true,buildToolsAbsent:true,artifactsSha256:hash.digest('hex')}));
`;

async function imageMetrics(target) {
  const tag = `${project}:${target}`;
  const image = JSON.parse((await docker(["image", "inspect", tag])).output)[0];
  const filesystem = await measureUnpackedImageSize(image.Id, { docker, owner: project });
  const runtime = JSON.parse(
    (
      await docker([
        "run",
        "--rm",
        "--network=none",
        "--entrypoint",
        nodeBin(target),
        tag,
        "-e",
        inspectRuntimeSource,
      ])
    ).output,
  );
  const archive = path.join(temporary, `${target}.oci.tar`);
  const exported = await docker(
    [
      "buildx",
      "build",
      "--builder",
      builder,
      "--progress=plain",
      "--provenance=false",
      "--target",
      target,
      "--output",
      `type=oci,dest=${archive},compression=gzip,force-compression=true`,
      context,
    ],
    { log: `export-${target}.log` },
  );
  report.images[target] = {
    id: image.Id,
    imageStoreBytes: image.Size,
    ...filesystem,
    ...(await ociSize(archive)),
    exportMs: exported.ms,
    runtime,
    samples: [],
  };
  await checkpoint();
}

async function composeConfig(mode, target = "production", extraEnvironment = {}) {
  const name = `${project}-${mode}`;
  const port = await freePort();
  let inspectorPort = await freePort();
  while (inspectorPort === port) inspectorPort = await freePort();
  let sandboxPort = await freePort();
  while (sandboxPort === port || sandboxPort === inspectorPort) sandboxPort = await freePort();
  const env = {
    PROD_HOST: "127.0.0.1",
    PROD_PORT: String(port),
    DEV_PORT: String(port),
    MCP_INSPECTOR_PORT: String(inspectorPort),
    MCP_SANDBOX_PORT: String(sandboxPort),
    MCP_ENABLED: "true",
    MCP_ALLOWED_ORIGINS: "",
    ...extraEnvironment,
  };
  const override = path.join(temporary, `${mode}-override.json`);
  await writeFile(
    override,
    JSON.stringify({
      services: {
        web: {
          image: `${project}:${target}`,
          build: { labels: { "dev.prelude.stack.run": project } },
          cpus: 2,
          mem_limit: mode === "production" ? "1g" : "4g",
          ...(mode === "production"
            ? {
                healthcheck: {
                  test: [
                    "CMD",
                    nodeBin(target),
                    "-e",
                    "fetch('http://127.0.0.1:3000/offline').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                  ],
                },
              }
            : {}),
        },
      },
    }),
  );
  const file = mode === "production" ? "compose.yaml" : "compose.dev.yaml";
  const args = ["compose", "--project-name", name, "-f", path.join(context, file), "-f", override];
  const config = {
    name,
    args,
    env,
    port,
    inspectorPort,
    sandboxPort,
    mode,
    origin: `http://127.0.0.1:${port}`,
  };
  ownedProjects.add(config);
  return config;
}

async function waitReady(origin, timeout = 180_000) {
  const started = performance.now();
  let lastStatus;
  while (performance.now() - started < timeout) {
    controller.signal.throwIfAborted();
    try {
      const response = await fetch(`${origin}/api/v1/tasks?status=all`, {
        signal: AbortSignal.timeout(1500),
      });
      lastStatus = response.status;
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      /* A container may still be starting or compiling. */
    }
    await delay(100);
  }
  throw new Error(`Stack at ${origin} was not ready (last status ${lastStatus})`);
}

async function containerId(config) {
  const id = (
    await docker([...config.args, "ps", "--quiet", "web"], { env: config.env })
  ).output.trim();
  assert(/^[a-f0-9]{12,64}$/.test(id), "Expected exactly one owned web container");
  return id;
}

async function launch(config) {
  const started = performance.now();
  await docker([...config.args, "up", "--detach", "--no-build", "--force-recreate", "web"], {
    env: config.env,
  });
  await waitReady(config.origin);
  const commandToReadyMs = performance.now() - started;
  const readyAt = Date.now();
  const id = await containerId(config);
  const inspected = JSON.parse((await docker(["inspect", id])).output)[0];
  assert.equal(inspected.Config.Labels["com.docker.compose.project"], config.name);
  const htmlStart = performance.now();
  const html = await fetch(config.origin);
  assert.equal(html.status, 200);
  await html.arrayBuffer();
  return {
    id,
    commandToReadyMs,
    containerToReadyMs: readyAt - Date.parse(inspected.State.StartedAt),
    firstHtmlMs: performance.now() - htmlStart,
  };
}

async function rss(id, target) {
  const source = `const fs=require('node:fs');let bytes=0;for(const pid of fs.readdirSync('/proc')){if(!/^\\d+$/.test(pid)||+pid===process.pid)continue;try{if(!fs.readlinkSync('/proc/'+pid+'/exe').endsWith('/node'))continue;const status=fs.readFileSync('/proc/'+pid+'/status','utf8');bytes+=Number(status.match(/^VmRSS:\\s+(\\d+)/m)?.[1]??0)*1024;}catch{}}console.log(bytes);`;
  return Number((await docker(["exec", id, nodeBin(target), "-e", source])).output.trim());
}

async function load(origin) {
  const routes = report.methodology.requests.routes;
  for (let index = 0; index < 6; index++)
    await (await fetch(new URL(routes[index % routes.length], origin))).arrayBuffer();
  const latencies = [];
  const perRoute = Object.fromEntries(routes.map((route) => [route, []]));
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const index = next++;
        if (index >= 50) return;
        const started = performance.now();
        const response = await fetch(new URL(routes[index % routes.length], origin), {
          signal: AbortSignal.timeout(30_000),
        });
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        const elapsed = performance.now() - started;
        latencies.push(elapsed);
        perRoute[routes[index % routes.length]].push(elapsed);
      }
    }),
  );
  const summary = (values) => {
    values.sort((a, b) => a - b);
    return {
      requests: values.length,
      p50Ms: values[Math.ceil(values.length * 0.5) - 1],
      p95Ms: values[Math.ceil(values.length * 0.95) - 1],
      minMs: values[0],
      maxMs: values.at(-1),
    };
  };
  return {
    ...summary(latencies),
    byRoute: Object.fromEntries(
      Object.entries(perRoute).map(([route, values]) => [route, summary(values)]),
    ),
  };
}

async function stopStack(config) {
  const id = await containerId(config);
  await docker([...config.args, "stop", "--timeout", "30", "web"], { env: config.env });
  const stopped = JSON.parse((await docker(["inspect", id])).output)[0];
  assert.equal(stopped.State.Running, false);
  assert.notEqual(
    stopped.State.ExitCode,
    137,
    "Container needed SIGKILL instead of shutting down gracefully",
  );
  await docker([...config.args, "down", "--volumes"], { env: config.env });
}

async function browserChecks(config, target, id) {
  await command(
    process.execPath,
    [require.resolve("@playwright/test/cli"), "test", "--config", "playwright.stack.config.ts"],
    {
      env: {
        PRELUDE_STACK_MODE: target === "development" ? "development" : "production",
        PRELUDE_STACK_URL: config.origin,
        PRELUDE_STACK_INSPECTOR_URL: `http://127.0.0.1:${config.inspectorPort}`,
        PRELUDE_STACK_SANDBOX_URL: `http://127.0.0.1:${config.sandboxPort}`,
        PRELUDE_STACK_CONTEXT: context,
        PRELUDE_STACK_CONTAINER: id,
        PRELUDE_STACK_PROJECT: config.name,
        PRELUDE_STACK_NODE_BIN: nodeBin(target),
      },
      log: `browser-${target}.log`,
    },
  );
}

let watch;
let watchDone = Promise.resolve();
let watchOutput = "";
let watchError;
let watchStopped = false;
let files;

async function stopWatch() {
  if (!watch || watchStopped) return;
  watchStopped = true;
  const pid = watch.pid;
  if (pid && watch.exitCode === null && watch.signalCode === null) {
    if (process.platform === "win32") {
      // docker.exe owns a Compose plugin child. Terminate only this spawned tree,
      // otherwise the orphan can keep the disposable context open on Windows.
      await terminateOwnedTree(watch);
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  const finished = await Promise.race([
    watchDone.then(() => true),
    delay(5000, false, { ref: false }),
  ]);
  if (!finished) {
    await terminateOwnedTree(watch);
    await watchDone;
  }
  if (process.platform !== "win32" && pid) {
    // The CLI may exit before its Compose plugin; the owned process group remains ours.
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
try {
  const engine = await docker(["version", "--format", "{{json .}}"], { timeout: 30_000 });
  report.docker = JSON.parse(engine.output);
  assert.equal(report.docker.Server.Os, "linux", "Docker must run Linux containers");
  report.compose = (await docker(["compose", "version", "--short"])).output.trim();
  files = await copyContext();
  await docker(["buildx", "create", "--name", builder, "--driver", "docker-container"]);
  builderCreated = true;
  await build("production", "production-cold");
  await build("production-slim", "slim-cold-assembly");
  for (const target of ["production", "production-slim"]) {
    const cached = await build(target, `${target}-unchanged`);
    assert(cached.dependencyCacheHit, "Unchanged build must reuse dependency installation");
    assert(cached.compilationCacheHit, "Unchanged build must reuse Next.js compilation");
  }
  const changedSource = path.join(context, "apps/web/src/components/animation-examples.tsx");
  const original = await readFile(changedSource, "utf8");
  await writeFile(changedSource, `${original}\n// isolated stack source-cache probe\n`);
  for (const target of ["production", "production-slim"]) {
    const changed = await build(target, `${target}-source-change`);
    assert(changed.dependencyCacheHit, "Source changes must reuse dependency installation");
    if (target === "production")
      assert(
        !changed.compilationCacheHit,
        "A source change must recompile the common application build",
      );
  }
  await writeFile(changedSource, original);
  for (const target of ["production", "production-slim"]) {
    await build(target, `${target}-restore`);
    await imageMetrics(target);
  }
  assert.equal(
    report.images.production.runtime.artifactsSha256,
    report.images["production-slim"].runtime.artifactsSha256,
    "Runtime images must contain byte-identical app artifacts",
  );
  assert(
    report.images.production.unpackedBytes < report.images["production-slim"].unpackedBytes,
    "Production image must be smaller than the slim baseline when unpacked",
  );
  assert(
    report.images.production.gzipLayerBytes < report.images["production-slim"].gzipLayerBytes,
    "Production image must be smaller than the slim baseline when compressed",
  );
  for (const target of ["production", "production-slim"]) {
    const config = await composeConfig("production", target);
    for (let index = 0; index < samples; index++) {
      console.log(`Stack: ${target} runtime sample ${index + 1}/${samples}`);
      const ready = await launch(config);
      const idleRssBytes = await rss(ready.id, target);
      const latency = await load(config.origin);
      report.images[target].samples.push({
        ...ready,
        idleRssBytes,
        loadedRssBytes: await rss(ready.id, target),
        latency,
      });
      await checkpoint();
      if (index === 0) {
        await browserChecks(config, target, ready.id);
        report.acceptance[target] = "passed";
        await checkpoint();
      }
      await stopStack(config);
    }
  }
  const disabled = await composeConfig("production", "production", { MCP_ENABLED: "false" });
  await launch(disabled);
  assert.equal((await fetch(`${disabled.origin}/api/mcp`)).status, 404);
  assert.equal((await fetch(`${disabled.origin}/api/v1/tasks?status=all`)).status, 200);
  disabled.env.MCP_ENABLED = "true";
  await launch(disabled);
  assert.equal((await fetch(`${disabled.origin}/api/mcp`)).status, 405);
  report.acceptance.runtimeMcpToggleWithoutBuild = "passed";
  await checkpoint();
  await stopStack(disabled);
  await build("development", "development");
  const development = await composeConfig("development", "development");
  const ready = await launch(development);
  watch = spawn("docker", [...development.args, "watch", "--no-up", "web"], {
    env: { ...process.env, ...development.env, BUILDX_BUILDER: builder },
    // Absolute -f paths keep Compose rooted in the copy without a Windows cwd lock.
    cwd: root,
    windowsHide: true,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchDone = new Promise((resolve) => {
    watch.once("exit", resolve);
    watch.once("error", (error) => {
      watchError = error;
      resolve();
    });
  });
  watch.stdout.on("data", (chunk) => {
    watchOutput += chunk;
  });
  watch.stderr.on("data", (chunk) => {
    watchOutput += chunk;
  });
  await delay(2000);
  if (watchError) throw watchError;
  assert.equal(watch.exitCode, null, "Compose watch failed to start");
  await browserChecks(development, "development", ready.id);
  report.acceptance.developmentInspectorAndHmr = "passed";
  report.acceptance.developmentMcpAppSandbox = {
    status: "passed",
    appPort: development.port,
    inspectorPort: development.inspectorPort,
    sandboxPort: development.sandboxPort,
  };
  await checkpoint();
  const manifestPath = path.join(context, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...manifest, description: `Isolated manifest rebuild ${project}` }, null, 2)}\n`,
  );
  const rebuildStarted = performance.now();
  let replacement;
  while (performance.now() - rebuildStarted < 180_000) {
    controller.signal.throwIfAborted();
    assert.equal(watch.exitCode, null, "Compose watch stopped during rebuild");
    try {
      replacement = await containerId(development);
    } catch {
      /* Recreate briefly removes the old container. */
    }
    if (replacement && replacement !== ready.id) break;
    await delay(1000);
  }
  assert(
    replacement && replacement !== ready.id,
    "Manifest change did not rebuild the development container",
  );
  await waitReady(development.origin);
  ownedImageIds.add(JSON.parse((await docker(["inspect", replacement])).output)[0].Image);
  report.acceptance.manifestWatchRebuild = {
    status: "passed",
    ms: performance.now() - rebuildStarted,
  };
  await checkpoint();
  await stopWatch();
  await writeFile(path.join(reportDirectory, "compose-watch.log"), redact(watchOutput));
  assert.equal(
    await sourceDigest(files),
    report.source.sha256,
    "Stack checks changed host source files",
  );
  report.acceptance.hostSourceUnchanged = "passed";
  await stopStack(development);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = redact(error instanceof Error ? (error.stack ?? error.message) : String(error));
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await checkpoint();
  const cleanupErrors = [];
  await stopWatch().catch((error) => cleanupErrors.push(error.message));
  if (watchOutput)
    await writeFile(path.join(reportDirectory, "compose-watch.log"), redact(watchOutput));
  const projects = new Map([...ownedProjects].map((config) => [config.name, config]));
  for (const config of projects.values()) {
    await docker([...config.args, "logs", "--no-color"], {
      env: config.env,
      cleanup: true,
      log: `${config.args[2]}-containers.log`,
    }).catch(() => undefined);
    await docker([...config.args, "down", "--volumes", "--remove-orphans"], {
      env: config.env,
      cleanup: true,
      timeout: 60_000,
    }).catch((error) => cleanupErrors.push(error.message));
    await docker(
      ["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${config.name}`],
      { cleanup: true },
    )
      .then(({ output }) =>
        assert.equal(output.trim(), "", `Owned containers remain for ${config.name}`),
      )
      .catch((error) => cleanupErrors.push(error.message));
  }
  const ports = new Set(
    [...ownedProjects].flatMap((config) =>
      config.mode === "development"
        ? [config.port, config.inspectorPort, config.sandboxPort]
        : [config.port],
    ),
  );
  for (const port of ports) {
    const probe = createServer();
    await new Promise((resolve) => {
      probe.once("error", (error) => {
        cleanupErrors.push(`Port ${port} was not released: ${error.message}`);
        resolve();
      });
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
  }
  await docker(
    ["image", "ls", "--all", "--quiet", "--no-trunc", "--filter", `label=${imageLabel}`],
    { cleanup: true },
  )
    .then(({ output }) => {
      for (const id of output.trim().split(/\s+/).filter(Boolean)) ownedImageIds.add(id);
    })
    .catch((error) => cleanupErrors.push(error.message));
  if (builderCreated)
    await docker(["buildx", "rm", "--force", builder], { cleanup: true, timeout: 60_000 }).catch(
      (error) => cleanupErrors.push(error.message),
    );
  if (ownedImages.size)
    await docker(["image", "rm", ...ownedImages], { cleanup: true, timeout: 60_000 }).catch(
      (error) => cleanupErrors.push(error.message),
    );
  if (ownedImageIds.size) {
    await docker(["image", "ls", "--all", "--quiet", "--no-trunc"], { cleanup: true })
      .then(async ({ output }) => {
        const remaining = new Set(output.trim().split(/\s+/));
        for (const id of ownedImageIds) {
          if (!remaining.has(id)) continue;
          const image = JSON.parse(
            (await docker(["image", "inspect", id], { cleanup: true })).output,
          )[0];
          // Preserve any image another user tagged while this run was active.
          if (image.RepoTags?.length) continue;
          await docker(["image", "rm", id], { cleanup: true });
        }
      })
      .catch((error) => cleanupErrors.push(error.message));
  }
  // The only recursive deletion is the fresh mkdtemp directory owned by this run.
  assert(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}${project}-`));
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(
    (error) => {
      cleanupErrors.push(
        `Could not remove owned temporary directory ${temporary}: ${error.message}`,
      );
      report.remainingTemporaryDirectory = temporary;
    },
  );
  report.acceptance.cleanup = cleanupErrors.length
    ? { status: "failed", errors: cleanupErrors }
    : "passed";
  if (cleanupErrors.length) {
    report.status = "failed";
    process.exitCode = 1;
    console.error(cleanupErrors.join("\n"));
  }
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(`Stack verification ${report.status}: ${path.join(reportDirectory, "report.json")}`);
}
