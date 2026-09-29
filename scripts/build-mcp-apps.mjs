import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Script } from "node:vm";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

export function bundleOptions(app, development) {
  return {
    cwd: app,
    config: false,
    entry: [path.join(app, "src/mcp-apps/tasks/main.tsx")],
    platform: "browser",
    target: "es2022",
    format: "iife",
    dts: false,
    sourcemap: false,
    minify: !development,
    clean: false,
    write: false,
    deps: { alwaysBundle: [/.*/], onlyBundle: false, onlyImport: [] },
    define: { "process.env.NODE_ENV": JSON.stringify(development ? "development" : "production") },
    inputOptions: {
      transform: { jsx: { runtime: "automatic" } },
      onLog(level, log, defaultHandler) {
        // Every module here is a browser module; React's server boundary marker
        // has no meaning in this standalone IIFE. Keep other diagnostics visible.
        if (log.code === "MODULE_LEVEL_DIRECTIVE" && /["']use client["']/.test(log.message)) return;
        defaultHandler(level, log);
      },
    },
    outputOptions: { codeSplitting: false, comments: { legal: true } },
  };
}

export function bundledScript(result) {
  assert.equal(result.bundles.length, 1, "The MCP App must produce one JavaScript bundle.");
  const chunks = result.bundles[0].chunks;
  assert.equal(chunks.length, 1, "The MCP App must not emit extra chunks or assets.");
  const chunk = chunks[0];
  assert.equal(chunk.type, "chunk", "The MCP App output must be JavaScript.");
  for (const key of ["imports", "dynamicImports", "referencedFiles"]) {
    assert.equal(chunk[key]?.length ?? 0, 0, `The MCP App must not retain ${key}.`);
  }
  assert(!/\brequire\s*\(/.test(chunk.code), "The MCP App must not retain runtime require calls.");
  // Parse without executing. An IIFE may not contain module imports or exports.
  new Script(chunk.code, { filename: "mcp-app-tasks.js" });
  return chunk.code;
}

export function appHtml(script, css) {
  assert(!/<\/script\b/i.test(script), "JavaScript contains an unsafe inline script terminator.");
  assert(!/<\/style\b/i.test(css), "CSS contains an unsafe inline style terminator.");
  assert(!/@import\b/i.test(css), "The MCP App must inline all CSS imports.");
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))/gi)) {
    assert(
      /^data:/i.test(match[1] ?? match[2] ?? match[3]),
      "The MCP App must not load external CSS assets.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<title>Prelude tasks</title>
<!--PRELUDE_MCP_APP_CONFIG-->
<style>${css}</style>
</head>
<body><div id="root"></div><script>${script}</script></body>
</html>
`;
}

export async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function compileCss(app, development, signal) {
  const require = createRequire(path.join(app, "package.json"));
  const manifestPath = require.resolve("@tailwindcss/cli/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const binary = path.resolve(path.dirname(manifestPath), manifest.bin.tailwindcss);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        // The inherited disconnect listener keeps an owned child alive. Release
        // that channel after this one-shot CLI completes so it can exit normally.
        "try { await import(process.argv[1]); } finally { if (process.connected) { process.removeAllListeners('disconnect'); process.disconnect(); } }",
        pathToFileURL(binary).href,
        "-i",
        "src/mcp-apps/tasks/styles.css",
        development ? "--optimize" : "--minify",
      ],
      {
        cwd: app,
        env: process.env,
        windowsHide: true,
        shell: false,
        signal,
        // Inherit the launcher's disconnect preload into this owned descendant.
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let css = "";
    let errors = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      css += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      errors += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`Tailwind CSS compilation failed:\n${errors.trim()}`));
      else resolve(css);
    });
  });
}

export async function buildMcpApps({ root = workspaceRoot, development = false, signal } = {}) {
  signal?.throwIfAborted();
  const app = path.join(root, "apps/web");
  const require = createRequire(path.join(app, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("tsdown")).href);
  const [javascript, css] = await Promise.all([
    build(bundleOptions(app, development)).then(bundledScript),
    compileCss(app, development, signal),
  ]);
  signal?.throwIfAborted();
  const output = path.join(app, ".generated/mcp-apps/tasks.html");
  await atomicWrite(output, appHtml(javascript, css));
  return output;
}

export async function watchMcpApps({
  root = workspaceRoot,
  signal,
  build = () => buildMcpApps({ root, development: true, signal }),
  onReady = () => {},
  onError = (error) => console.error(`MCP App rebuild failed: ${error.message}`),
} = {}) {
  let dirty = true;
  let building;
  let timer;
  let first = true;
  const rebuild = async () => {
    if (building) return building;
    building = (async () => {
      while (dirty && !signal?.aborted) {
        dirty = false;
        try {
          await build();
          if (first) {
            first = false;
            onReady();
          }
        } catch (error) {
          if (first) throw error;
          if (!signal?.aborted) onError(error);
        }
      }
    })();
    try {
      await building;
    } finally {
      building = undefined;
    }
  };
  const changed = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild().catch(onError), 75);
  };
  const watchers = [];
  try {
    for (const directory of ["apps/web/src/mcp-apps", "packages/ui/src"]) {
      const watcher = watch(path.join(root, directory), { recursive: true }, changed);
      watcher.on("error", onError);
      watchers.push(watcher);
    }
    await rebuild();
    if (!signal?.aborted) {
      await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
    }
  } finally {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    await building;
  }
}

export async function buildMain(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: { development: { type: "boolean" }, watch: { type: "boolean" } },
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (values.watch) {
      await watchMcpApps({
        signal: controller.signal,
        onReady: () => process.send?.({ type: "mcp-apps-ready" }),
      });
    } else {
      const output = await buildMcpApps({
        development: Boolean(values.development),
        signal: controller.signal,
      });
      console.log(`MCP App built: ${path.relative(workspaceRoot, output)}`);
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMain().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
