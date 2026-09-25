import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: false,
  globPatterns: [
    ".next/static/**/*.{js,css,png,jpg,jpeg,svg,webp,avif,ico,woff,woff2}",
    "public/icons/**/*",
    ".next/server/app/offline.html",
  ],
  esbuildOptions: { format: "esm" },
});
