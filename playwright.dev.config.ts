import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Includes tests/dev/demo/.
  testDir: "./tests/dev",
  outputDir: "./test-results/development",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  // demo:start
  // CI shards this list with --fully-parallel, so each shard takes a contiguous slice of it. The
  // demo comes first and its Spanish MCP App test last, so the two slow MCP App tests in
  // tests/dev/demo/ stay in different halves when tests are added to the shared ones.
  projects: [
    { name: "demo", testDir: "./tests/dev/demo", testIgnore: "**/mcp-apps-es.spec.ts" },
    { name: "development", testIgnore: "**/demo/**" },
    { name: "demo-es", testDir: "./tests/dev/demo", testMatch: "**/mcp-apps-es.spec.ts" },
  ],
  // demo:end
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3102",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Run dev-web directly: pnpm starts scripts in their own POSIX process group, so
    // Playwright's shutdown signal would orphan the servers and wait for them forever.
    command: "node scripts/dev-web.mjs --hostname 127.0.0.1 --port 3102",
    env: { MCP_INSPECTOR_PORT: "6284", MCP_SANDBOX_PORT: "6286" },
    // dev-web prints this once Next.js, the Inspector and its sandbox all respond.
    wait: { stdout: /MCP Inspector: http/ },
    timeout: 180_000,
    // SIGTERM lets dev-web stop its child process groups. Windows ignores this and kills the tree.
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
  },
});
