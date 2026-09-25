import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
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
      name: "desktop",
      testMatch: "app.spec.ts",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
    },
    {
      name: "mobile",
      testMatch: "app.spec.ts",
      use: { ...devices["Pixel 7"], serviceWorkers: "block" },
    },
    {
      name: "pwa",
      testMatch: "pwa.spec.ts",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" },
    },
  ],
  webServer: {
    command: "pnpm --filter @repo/web start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
