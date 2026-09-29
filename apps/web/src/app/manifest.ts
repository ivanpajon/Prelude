import { getPwaMessages } from "@repo/i18n/pwa";
import type { MetadataRoute } from "next";
import { getRequestLocale } from "../i18n/http-locale";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getRequestLocale();
  return {
    id: "/",
    name: "Prelude",
    short_name: "Prelude",
    description: getPwaMessages(locale).Pwa.manifestDescription,
    lang: locale,
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8f4",
    theme_color: "#20382a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
