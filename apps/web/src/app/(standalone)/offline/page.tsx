import { defaultLocale } from "@repo/i18n";
import { getPwaMessages } from "@repo/i18n/pwa";
import type { Metadata } from "next";
import { OfflineContent } from "./offline-content";

export const metadata: Metadata = {
  title: getPwaMessages(defaultLocale).Pwa.offlineDocumentTitle,
};

export default function OfflinePage() {
  return <OfflineContent />;
}
