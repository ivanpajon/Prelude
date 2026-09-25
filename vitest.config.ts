import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.mjs"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["packages/**/*.test.tsx", "apps/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "packages/{api,contracts,temporal}/src/**/*.ts",
        "apps/web/src/lib/{query-client,task-search,workbench-store}.ts",
        "packages/ui/src/components/{motion-provider,morph-icon}.tsx",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/contract-types.ts"],
    },
  },
});
