import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { constants, gzipSync } from "node:zlib";
import { atomicWrite, buildMcpApps, bundleOptions } from "./build-mcp-apps.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));

async function version(name, resolve = require) {
  try {
    return JSON.parse(await readFile(resolve.resolve(`${name}/package.json`), "utf8")).version;
  } catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
  }
  // Some build tools hide their manifest through package exports. Locate it
  // relative to the resolved installed entry, checking its package identity.
  let directory = path.dirname(resolve.resolve(name));
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      if (manifest.name === name) return manifest.version;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(directory);
    assert(parent !== directory, `Cannot locate the installed ${name} version.`);
    directory = parent;
  }
}

function inlineContents(html, tag) {
  const start = html.indexOf(`<${tag}>`);
  const end = html.indexOf(`</${tag}>`, start);
  assert(start !== -1 && end !== -1, `The generated MCP App has no inline ${tag}.`);
  return html.slice(start + tag.length + 2, end);
}

export async function measureMcpApps() {
  const options = bundleOptions(web, false);
  const startedAt = new Date().toISOString();
  const runs = [];
  let finalHtml;
  for (let sample = 1; sample <= 3; sample += 1) {
    const start = performance.now();
    const artifact = await buildMcpApps({ root });
    const elapsedMs = performance.now() - start;
    finalHtml = await readFile(artifact);
    runs.push({
      sample,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      sha256: createHash("sha256").update(finalHtml).digest("hex"),
    });
    console.log(`MCP App production build ${sample}/3: ${elapsedMs.toFixed(2)} ms`);
  }
  assert(finalHtml, "No generated MCP App was measured.");
  const html = finalHtml.toString("utf8");
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/cli/package.json"));
  const optimizerRequire = createRequire(tailwindRequire.resolve("@tailwindcss/node"));
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    versions: {
      tsdown: await version("tsdown"),
      tailwindCli: await version("@tailwindcss/cli"),
      tailwind: await version("tailwindcss"),
      lightningCss: await version("lightningcss", optimizerRequire),
      react: await version("react"),
      reactDom: await version("react-dom"),
    },
    methodology: {
      samples: 3,
      timing:
        "Sequential full production JavaScript, CSS and atomic HTML builds in one Node process. Each build starts a fresh Tailwind CLI child. No Turbo or generated-artifact cache is used; module and operating-system caches may be warm after the first sample. Metadata reads and gzip measurement are outside the timings.",
      gzip: { level: constants.Z_DEFAULT_COMPRESSION },
      javascriptBytes: "UTF-8 inline script contents, excluding script tags.",
      cssBytes: "UTF-8 inline style contents, excluding style tags.",
    },
    options: {
      entry: "apps/web/src/mcp-apps/tasks/main.tsx",
      stylesheet: "apps/web/src/mcp-apps/tasks/styles.css",
      output: "apps/web/.generated/mcp-apps/tasks.html",
      platform: options.platform,
      target: options.target,
      format: options.format,
      jsxRuntime: options.inputOptions.transform.jsx.runtime,
      minify: options.minify,
      sourcemap: options.sourcemap,
      declarations: options.dts,
      bundleAllDependencies: options.deps.alwaysBundle.map(String),
      css: "Tailwind CLI --minify (LightningCSS)",
    },
    runs,
    identicalOutput: new Set(runs.map((run) => run.sha256)).size === 1,
    sizes: {
      htmlBytes: finalHtml.byteLength,
      javascriptBytes: Buffer.byteLength(inlineContents(html, "script"), "utf8"),
      cssBytes: Buffer.byteLength(inlineContents(html, "style"), "utf8"),
      htmlGzipBytes: gzipSync(finalHtml, { level: constants.Z_DEFAULT_COMPRESSION }).byteLength,
    },
  };
  const output = path.join(root, "test-results/mcp-apps/report.json");
  await atomicWrite(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`MCP App measurements: ${path.relative(root, output)}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  measureMcpApps().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
