import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ["@repo/ui", "@repo/contracts", "@repo/api"],
};

export default nextConfig;
