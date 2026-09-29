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
const publicDirectory = path.resolve(root, "apps/web/public");
const worker = path.resolve(publicDirectory, "sw.js");
const widget = path.resolve(root, "apps/web/.generated/mcp-apps/tasks.html");
const artifacts = [worker, `${worker}.map`, widget].filter(existsSync);
assert(artifacts.includes(worker), "Build did not produce a service worker.");
assert(artifacts.includes(widget), "Build did not produce the MCP App HTML.");
const saved = artifacts.map((file) => {
  assert(
    path.dirname(file) === publicDirectory || file === widget,
    "Artifact must be a known generated service worker or MCP App file.",
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
  console.log(
    `Verified byte-for-byte restoration of ${saved.length} service-worker/MCP App artifacts.`,
  );
} finally {
  for (const { file, bytes } of saved) writeFileSync(file, bytes);
}
