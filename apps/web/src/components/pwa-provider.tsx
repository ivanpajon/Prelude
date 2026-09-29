"use client";

import { toast } from "@repo/ui/components/toast";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPwaUpdateController, type PwaUpdateNotice } from "../lib/pwa-update-controller";

type ServiceWorkerClient = NonNullable<ReturnType<typeof useSerwist>["serwist"]>;

// Serwist keeps its client across mounts. Reuse its registration attempt across
// Strict Mode effect replay and provider remounts, including failed attempts.
const registrations = new WeakMap<
  ServiceWorkerClient,
  ReturnType<ServiceWorkerClient["register"]>
>();

function registerOnce(serwist: ServiceWorkerClient) {
  const existing = registrations.get(serwist);
  if (existing) return existing;

  const registration = Promise.resolve()
    .then(() => serwist.register())
    .catch(() => undefined);
  registrations.set(serwist, registration);
  return registration;
}

const noticeId = "pwa-update";

function UpdateNotice() {
  const { serwist } = useSerwist();
  const t = useTranslations("Pwa");
  const [notice, setNotice] = useState<PwaUpdateNotice | null>(null);
  const controller = useRef<ReturnType<typeof createPwaUpdateController> | null>(null);
  const closing = useRef(false);
  const closeNotice = useCallback(() => {
    closing.current = true;
    toast.close(noticeId);
    closing.current = false;
  }, []);

  // Language changes update presentation without resetting approval or dismissal guards.
  useEffect(() => {
    if (!serwist || !("serviceWorker" in navigator)) return;
    const instance = createPwaUpdateController({
      serviceWorker: navigator.serviceWorker,
      register: () => registerOnce(serwist),
      reload: () => window.location.reload(),
      onChange: setNotice,
    });
    controller.current = instance;

    return () => {
      instance.dispose();
      controller.current = null;
      closeNotice();
      setNotice(null);
    };
  }, [serwist, closeNotice]);

  useEffect(() => {
    if (!notice) {
      closeNotice();
      return;
    }
    toast.add({
      id: noticeId,
      title: t(`${notice.status}Title`),
      description: t(`${notice.status}Description`),
      type: notice.status === "updating" ? "loading" : notice.status === "error" ? "error" : "info",
      priority: notice.status === "error" ? "high" : "low",
      timeout: 0,
      actionProps: {
        children: t(`${notice.status}Action`),
        disabled: notice.status === "updating",
        onClick: () => controller.current?.apply(),
      },
      onClose: () => {
        if (!closing.current) controller.current?.dismiss();
      },
    });
  }, [notice, t, closeNotice]);

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
