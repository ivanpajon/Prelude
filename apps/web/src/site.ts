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
  /**
   * Browser colors: `theme` tints the browser and installed-app toolbars, and `background`
   * fills the installed app's splash screen.
   */
  colors: { theme: string; background: string };
}

export const site: SiteIdentity = {
  name: "Prelude",
  slug: "prelude",
  repositoryUrl: "https://github.com/ivanpajon/Prelude",
  logo: { src: "/branding/logo.png", width: 360, height: 138 },
  colors: { theme: "#00786f", background: "#ffffff" },
};

/** Page icons under `apps/web/public/icons`, for the localized pages and the offline page. */
export const siteIcons = { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" };
