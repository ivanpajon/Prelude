import { site } from "../site";

/**
 * Title and version of the OpenAPI document; the title also heads the API reference. The
 * browser and stack tests import them from here, so changing them needs no test edits.
 * Those tests load this file without the app's `@/` alias, hence the relative import.
 */
export const apiInfo = { title: `${site.name} API`, version: "1.0.0" };
