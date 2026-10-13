/**
 * Project identity that is not translated. Change these values first when starting a new
 * project; translated names and descriptions live in the @repo/i18n catalogs.
 */
export interface SiteIdentity {
  /** Display name for metadata, the manifest, the API reference and the offline page. */
  name: string;
  /** Lowercase identifier, such as the MCP server name reported to clients. */
  slug: string;
  /** Source repository linked from the footer; leave it undefined to hide the link. */
  repositoryUrl?: string | undefined;
}

export const site: SiteIdentity = {
  name: "Prelude",
  slug: "prelude",
  repositoryUrl: "https://github.com/ivanpajon/Prelude",
};
