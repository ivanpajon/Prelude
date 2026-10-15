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
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  // Matches by file name, so tests/stack/demo/ specs for this mode run too.
  testMatch: `${mode}.spec.ts`,
  // demo:start
  // A development --shard takes a contiguous slice of this list. The shared checks come first,
  // so the two slow MCP App checks in tests/stack/demo/ fall into different halves.
  projects: [
    { name: "stack", testIgnore: "**/demo/**" },
    { name: "demo", testDir: "./tests/stack/demo" },
  ],
  // demo:end
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    serviceWorkers: mode === "production" ? "allow" : "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
