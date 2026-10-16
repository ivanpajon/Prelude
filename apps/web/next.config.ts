import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Prerendered pages cannot carry per-request nonces, so inline scripts and styles stay allowed.
// React uses eval only for development error stacks.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Links prefetch one shared App Shell per route; the default in the next major release.
  partialPrefetching: true,
  poweredByHeader: false,
  // Preserve next-intl's internal rewrite origin when binding to loopback IPs.
  // Next.js 16.4 still normalizes them asymmetrically: vercel/next.js#94745.
  skipProxyUrlNormalize: true,
  // demo:start
  outputFileTracingIncludes: { "/api/mcp": ["./.generated/mcp-apps/tasks.html"] },
  // demo:end
  // Docker binds internally to 0.0.0.0; browsers still reach HMR over loopback.
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone", outputFileTracingRoot: path.resolve(import.meta.dirname, "../..") }
    : {}),
  transpilePackages: ["@repo/ui", "@repo/contracts", "@repo/api", "@repo/temporal", "@repo/i18n"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Not on API routes: /api/docs has no CSP so Scalar can load its pinned CDN script (an
        // integrity hash guards it), and the development Inspector page sets its own.
        source: "/((?!api(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
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
