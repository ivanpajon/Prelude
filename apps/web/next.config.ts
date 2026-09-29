import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  skipProxyUrlNormalize: true,
  outputFileTracingIncludes: { "/api/mcp": ["./.generated/mcp-apps/tasks.html"] },
  // Docker binds internally to 0.0.0.0; browsers still reach HMR over loopback.
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone", outputFileTracingRoot: path.resolve(import.meta.dirname, "../..") }
    : {}),
  transpilePackages: ["@repo/ui", "@repo/contracts", "@repo/api", "@repo/temporal", "@repo/i18n"],
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Vary", value: "Cookie, Accept-Language" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
