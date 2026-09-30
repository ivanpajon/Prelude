"use client";

import { createPwaUpdateController, type PwaUpdateNotice } from "./pwa-update-controller";

export interface PwaUpdateSession {
  controller: ReturnType<typeof createPwaUpdateController>;
  subscribe: (listener: (notice: PwaUpdateNotice | null) => void) => () => void;
  getNotice: () => PwaUpdateNotice | null;
}

interface PwaUpdateSessionOptions {
  serviceWorker: ServiceWorkerContainer;
  lifecycle: Pick<Window, "addEventListener" | "removeEventListener">;
  register: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
}

// Only browser effects populate this cache. Locale Activity subtrees and their
// client instances share the document's native service-worker container.
const sessions = new WeakMap<ServiceWorkerContainer, PwaUpdateSession>();

function createSession({
  serviceWorker,
  lifecycle,
  register,
  reload,
}: PwaUpdateSessionOptions): PwaUpdateSession {
  let notice: PwaUpdateNotice | null = null;
  const listeners = new Set<(notice: PwaUpdateNotice | null) => void>();
  function publish(nextNotice: PwaUpdateNotice | null) {
    notice = nextNotice;
    for (const listener of listeners) listener(nextNotice);
  }
  const controller = createPwaUpdateController({
    serviceWorker,
    register,
    reload,
    onChange: publish,
  });
  const session: PwaUpdateSession = {
    controller,
    getNotice: () => notice,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const onPageHide = (event: PageTransitionEvent) => {
    // A page in the browser's back/forward cache is paused, not destroyed.
    if (event.persisted) return;
    controller.dispose();
    publish(null);
    listeners.clear();
    sessions.delete(serviceWorker);
    lifecycle.removeEventListener("pagehide", onPageHide);
  };
  lifecycle.addEventListener("pagehide", onPageHide);
  return session;
}

export function getPwaUpdateSession(options: PwaUpdateSessionOptions): PwaUpdateSession {
  const { serviceWorker } = options;
  if (!sessions.has(serviceWorker)) {
    sessions.set(serviceWorker, createSession(options));
  }
  const session = sessions.get(serviceWorker);
  if (session === undefined) throw new Error("PWA update session could not be initialized.");
  return session;
}
