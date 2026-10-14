import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// biome-ignore lint/suspicious/noUndeclaredEnvVars: This standalone check uses pnpm's executable path only to launch Turbo.
const pnpm = process.env.npm_execpath;
assert(pnpm, "Run this check with pnpm test:cache.");

function build() {
  const args = ["exec", "turbo", "run", "build"];
  const isScript = /\.[cm]?js$/.test(pnpm);
  const result = spawnSync(isScript ? process.execPath : pnpm, isScript ? [pnpm, ...args] : args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.status, 0, "Production build failed.");
  return result.stdout;
}

build();
const prerendered = JSON.parse(
  readFileSync(path.resolve(root, "apps/web/.next/prerender-manifest.json"), "utf8"),
);
for (const mode of ["always", "never"]) {
  for (const locale of ["en", "es"]) {
    const route = `/${mode}/${locale}`;
    assert.equal(prerendered.routes[route]?.compute, "static", `${route} must stay prerendered.`);
    assert.equal(
      prerendered.routes[route]?.response,
      "complete",
      `${route} must render its document.`,
    );
  }
}
const publicDirectory = path.resolve(root, "apps/web/public");
const worker = path.resolve(publicDirectory, "sw.js");
// Other generated files that the build must produce and the cache must restore.
const generated = [
  // demo:start
  path.resolve(root, "apps/web/.generated/mcp-apps/tasks.html"),
  // demo:end
];
const artifacts = [worker, `${worker}.map`, ...generated].filter(existsSync);
assert(artifacts.includes(worker), "Build did not produce a service worker.");
for (const file of generated) {
  assert(artifacts.includes(file), `Build did not produce ${path.relative(root, file)}.`);
}
const saved = artifacts.map((file) => {
  assert(
    path.dirname(file) === publicDirectory || generated.includes(file),
    "Artifact must be a known generated file.",
  );
  return { file, bytes: readFileSync(file) };
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  // Remove only the explicit generated artifacts, never source files or directories.
  for (const { file } of saved) unlinkSync(file);
  const output = build();
  assert.match(output, /cache hit/, "Expected Turbo to restore an existing build cache entry.");
  for (const { file, bytes } of saved) {
    assert.equal(
      hash(readFileSync(file)),
      hash(bytes),
      `Cache restoration changed ${path.basename(file)}.`,
    );
  }
  const count = `${saved.length} generated ${saved.length === 1 ? "artifact" : "artifacts"}`;
  console.log(`Verified byte-for-byte restoration of ${count}.`);
} finally {
  // Never overwrite a fresh build's output with the older saved bytes.
  for (const { file, bytes } of saved) if (!existsSync(file)) writeFileSync(file, bytes);
}
