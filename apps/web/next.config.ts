import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  outputFileTracingIncludes: { "/api/mcp": ["./.generated/mcp-apps/tasks.html"] },
  // Docker binds internally to 0.0.0.0; browsers still reach HMR over loopback.
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone", outputFileTracingRoot: path.resolve(import.meta.dirname, "../..") }
    : {}),
  transpilePackages: ["@repo/ui", "@repo/contracts", "@repo/api", "@repo/temporal"],
  async headers() {
    return [
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

export default nextConfig;
