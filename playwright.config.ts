import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/production",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mcp",
      testMatch: "mcp.spec.ts",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
    },
    {
      name: "desktop",
      testMatch: ["app.spec.ts", "openapi.spec.ts", "mcp-playground.spec.ts", "i18n.spec.ts"],
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
    },
    {
      name: "mobile",
      testMatch: ["app.spec.ts", "openapi.spec.ts", "mcp-playground.spec.ts", "i18n.spec.ts"],
      use: { ...devices["Pixel 7"], serviceWorkers: "block" },
    },
    {
      name: "pwa",
      testMatch: "pwa.spec.ts",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" },
    },
  ],
  webServer: {
    // Run Next.js directly: pnpm starts scripts in their own POSIX process group, so
    // Playwright's shutdown signal would orphan the server and wait for it forever.
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    cwd: "apps/web",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
  },
});
