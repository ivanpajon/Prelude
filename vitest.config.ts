import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          // Script and runtime tests spawn node and git; one spawn can take over 10 s on
          // hosts with on-access antivirus scanning.
          testTimeout: 120_000,
          server: { deps: { inline: ["next-intl"] } },
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.mjs"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          // CPU-limited containers can slow jsdom tests past Vitest's 5 s default.
          testTimeout: 30_000,
          server: { deps: { inline: ["next-intl"] } },
          include: ["packages/**/*.test.tsx", "apps/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["{apps,packages}/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.d.ts",
        "**/contract-types.ts",
        "**/src/testing/**",
      ],
    },
  },
});
