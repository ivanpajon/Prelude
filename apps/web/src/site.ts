/**
 * Project identity that is not translated. Change these values first when starting a new
 * project; translated names and descriptions live in the @repo/i18n catalogs.
 */
export interface SiteIdentity {
  /** Display name for metadata, the manifest, the API reference and the offline page. */
  name: string;
  /** Lowercase identifier, such as the MCP server name reported to clients. */
  slug: string;
  /**
   * Source repository linked from the footer, with GitHub's mark; change the icon in
   * `components/site-footer.tsx` for another host. Leave it undefined to hide the link.
   */
  repositoryUrl?: string | undefined;
  /** Header logo under `apps/web/public`, with its intrinsic size in pixels. */
  logo: { src: string; width: number; height: number };
}

export const site: SiteIdentity = {
  name: "Prelude",
  slug: "prelude",
  repositoryUrl: "https://github.com/ivanpajon/Prelude",
  logo: { src: "/branding/logo.png", width: 2027, height: 776 },
};
