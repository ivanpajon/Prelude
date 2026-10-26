import { site } from "../site";

/**
 * Title and version of the OpenAPI document; the title also heads the API reference. The
 * browser and stack tests import them from here, so changing them needs no test edits.
 * Those tests load this file without the app's `@/` alias, hence the relative import.
 */
export const apiInfo = { title: `${site.name} API`, version: "1.0.0" };

/**
 * The Scalar renderer that the API reference loads from jsDelivr. The oRPC package does not
 * pin this asset, so the version lives here, and Renovate updates it in this one place.
 */
export const scalarScriptUrl =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0/dist/browser/standalone.js";

/**
 * Subresource Integrity hash of the file at `scalarScriptUrl`. The browser refuses the script
 * if the file changes. Renovate cannot update it: after a version bump, compute the new value
 * with the command in docs/openapi.md (Scalar renderer and caching).
 */
export const scalarScriptIntegrity =
  "sha384-VXnKAz61Xwc3tbw1P+KKrUP7YbcsSl1Ik4is5UnogJyw9XEYZ5Ay/T1i0zPYtSZH";
