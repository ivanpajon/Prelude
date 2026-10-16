"use client";

import { toast } from "@repo/ui/components/toast";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { getPwaUpdateController, type PwaUpdateStatus } from "../lib/pwa-update-controller";

const noticeId = "pwa-update";

function UpdateNotice() {
  const { serwist } = useSerwist();
  const t = useTranslations("Pwa");

  // Every mounted locale tree mirrors the document's update state into its own Toaster.
  // Activity re-runs this when a hidden tree is shown again, which refreshes its stale toast.
  useEffect(() => {
    if (!serwist) return;
    const updates = getPwaUpdateController({
      serviceWorker: navigator.serviceWorker,
      serwist,
      reload: () => window.location.reload(),
    });
    const show = (status: PwaUpdateStatus | null) => {
      if (!status) {
        toast.close(noticeId);
        return;
      }
      toast.add({
        id: noticeId,
        title: t(`${status}Title`),
        description: t(`${status}Description`),
        type: status === "updating" ? "loading" : status === "error" ? "error" : "info",
        timeout: 0,
        actionProps: {
          children: t(`${status}Action`),
          disabled: status === "updating",
          onClick: updates.apply,
        },
        onClose: updates.dismiss,
      });
    };
    show(updates.getStatus());
    return updates.subscribe(show);
  }, [serwist, t]);

  return null;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      register={false}
      cacheOnNavigation={false}
      reloadOnOnline={false}
      options={{ scope: "/", type: "module", updateViaCache: "none" }}
    >
      {children}
      <UpdateNotice />
    </SerwistProvider>
  );
}
