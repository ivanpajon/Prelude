"use client";

import { Button } from "@repo/ui/components/button";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

function UpdateNotice() {
  const { serwist } = useSerwist();
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consent = useRef(false);
  const activationTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!serwist) return;

    let active = true;
    const onWaiting = () => {
      setAvailable(true);
      setError(null);
    };
    const onControlling = () => {
      if (activationTimeout.current !== null) {
        window.clearTimeout(activationTimeout.current);
        activationTimeout.current = null;
      }
      if (consent.current) {
        window.location.reload();
      } else {
        setAvailable(false);
      }
    };

    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);

    // The worker may already be waiting before this component subscribes.
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => {
        if (active && registration?.waiting) onWaiting();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
      if (activationTimeout.current !== null) {
        window.clearTimeout(activationTimeout.current);
      }
    };
  }, [serwist]);

  async function activateUpdate() {
    if (!serwist || updating) return;

    consent.current = true;
    setUpdating(true);
    setError(null);

    const reportFailure = () => {
      consent.current = false;
      setUpdating(false);
      setError("The update could not be activated. Please try again.");
    };

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        reportFailure();
        return;
      }
      if (!registration.waiting) {
        // Another tab may already have activated the available update.
        window.location.reload();
        return;
      }
      activationTimeout.current = window.setTimeout(reportFailure, 15_000);
      serwist.messageSkipWaiting();
    } catch {
      if (activationTimeout.current !== null) {
        window.clearTimeout(activationTimeout.current);
      }
      reportFailure();
    }
  }

  if (!available) return null;

  return (
    <aside
      aria-label="Application update"
      className="fixed right-4 bottom-4 left-4 z-50 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:left-auto sm:max-w-sm"
    >
      <p role="status" className="font-semibold">
        Update available
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Reload to use the latest version.</p>
      <Button className="mt-3" disabled={updating} onClick={activateUpdate}>
        {updating ? "Updating…" : "Reload to update"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </aside>
  );
}

export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      cacheOnNavigation={false}
      reloadOnOnline={false}
      options={{ scope: "/", type: "module", updateViaCache: "none" }}
    >
      {children}
      <UpdateNotice />
    </SerwistProvider>
  );
}
