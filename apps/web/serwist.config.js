import { readFileSync } from "node:fs";
import { serwist } from "@serwist/next/config";

// `serwist build` runs after `next build`, so the build manifest exists. Pages load these
// polyfills with <script noModule>, which every browser with service workers skips.
const { polyfillFiles } = JSON.parse(readFileSync(".next/build-manifest.json", "utf8"));

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: false,
  globPatterns: [
    ".next/static/**/*.{js,css,png,jpg,jpeg,svg,webp,avif,ico,woff,woff2}",
    "public/icons/**/*",
    ".next/server/app/offline.html",
  ],
  globIgnores: polyfillFiles.map((file) => `.next/${file}`),
  esbuildOptions: { format: "esm" },
});
