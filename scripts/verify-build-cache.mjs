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
  const result = spawnSync(process.execPath, [pnpm, "exec", "turbo", "run", "build"], {
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
const artifacts = [worker, `${worker}.map`].filter(existsSync);
assert(artifacts.includes(worker), "Build did not produce a service worker.");
const saved = artifacts.map((file) => {
  assert.equal(
    path.dirname(file),
    publicDirectory,
    "Artifact must be inside the web public directory.",
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
  console.log(`Verified byte-for-byte restoration of ${saved.length} service-worker artifact(s).`);
} finally {
  for (const { file, bytes } of saved) writeFileSync(file, bytes);
}
