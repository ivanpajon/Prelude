import { defaultLocale } from "@repo/i18n";
import { getPwaMessages } from "@repo/i18n/pwa";
import type { Metadata } from "next";
import { site } from "@/site";
import { OfflineContent } from "./offline-content";

export const metadata: Metadata = {
  title: `${getPwaMessages(defaultLocale).Pwa.offlineDocumentTitle} — ${site.name}`,
};

export default function OfflinePage() {
  return <OfflineContent />;
}
