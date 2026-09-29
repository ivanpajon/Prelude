import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PRELUDE_STACK_URL;
const mode = process.env.PRELUDE_STACK_MODE;
if (!baseURL || !["production", "development"].includes(mode ?? "")) {
  throw new Error("Run container acceptance through pnpm test:stack.");
}

export default defineConfig({
  testDir: "./tests/stack",
  outputDir: `./test-results/stack/browser/${mode}`,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  testMatch: `${mode}.spec.ts`,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    serviceWorkers: mode === "production" ? "allow" : "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
