"use client";

import { toast } from "@repo/ui/components/toast";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { type ReactNode, useEffect } from "react";
import { createPwaUpdateController } from "@/lib/pwa-update-controller";

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

const updateMessages = {
  available: {
    title: "Update available",
    description: "A new version is ready. Update now to reload this page.",
    action: "Update now",
    type: "info",
  },
  updating: {
    title: "Updating…",
    description: "This page will reload when the update takes control.",
    action: "Updating…",
    type: "loading",
  },
  ready: {
    title: "Update ready",
    description: "Another tab applied the update. Reload when you’re ready.",
    action: "Reload now",
    type: "info",
  },
  error: {
    title: "Couldn’t update",
    description: "The update could not be activated. Please try again.",
    action: "Try again",
    type: "error",
  },
};

function UpdateNotice() {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist || !("serviceWorker" in navigator)) return;

    const id = "pwa-update";
    let closing = false;
    const closeNotice = () => {
      closing = true;
      toast.close(id);
      closing = false;
    };
    const controller = createPwaUpdateController({
      serviceWorker: navigator.serviceWorker,
      register: () => registerOnce(serwist),
      reload: () => window.location.reload(),
      onChange: (notice) => {
        if (!notice) {
          closeNotice();
          return;
        }
        const message = updateMessages[notice.status];
        toast.add({
          id,
          title: message.title,
          description: message.description,
          type: message.type,
          priority: notice.status === "error" ? "high" : "low",
          timeout: 0,
          actionProps: {
            children: message.action,
            disabled: notice.status === "updating",
            onClick: () => controller.apply(),
          },
          onClose: () => {
            if (!closing) controller.dismiss();
          },
        });
      },
    });

    return () => {
      controller.dispose();
      closeNotice();
    };
  }, [serwist]);

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
