export interface PwaUpdateNotice {
  status: "available" | "updating" | "ready" | "error";
}

interface PwaUpdateControllerOptions {
  serviceWorker: ServiceWorkerContainer;
  register: () => Promise<ServiceWorkerRegistration | undefined>;
  onChange: (notice: PwaUpdateNotice | null) => void;
  reload: () => void;
}

/** Observe browser-discovered updates without polling or reloading unconsenting tabs. */
export function createPwaUpdateController({
  serviceWorker,
  register,
  onChange,
  reload,
}: PwaUpdateControllerOptions) {
  let disposed = false;
  let reloading = false;
  let applying = false;
  let attempt = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let lastController = serviceWorker.controller;
  let update: ServiceWorker | null = null;
  let notice: PwaUpdateNotice | null = null;
  const dismissed = new WeakSet<ServiceWorker>();
  const workerListeners = new Map<ServiceWorker, () => void>();

  function publish(status: PwaUpdateNotice["status"] | null) {
    if (disposed || notice?.status === status || (notice === null && status === null)) return;
    notice = status === null ? null : { status };
    onChange(notice);
  }

  function clearActivationTimeout() {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  }

  function reloadOnce() {
    if (disposed || reloading) return;
    reloading = true;
    applying = false;
    attempt += 1;
    clearActivationTimeout();
    publish(null);
    reload();
  }

  function fail(activeAttempt: number) {
    if (disposed || !applying || activeAttempt !== attempt) return;
    applying = false;
    attempt += 1;
    clearActivationTimeout();
    publish(update && dismissed.has(update) ? null : "error");
  }

  function onControllerChange() {
    if (disposed || reloading) return;
    const controller = serviceWorker.controller;
    if (!controller || controller === lastController) return;

    // The first claim is installation, unless we already observed a waiting replacement.
    const replacement = lastController !== null || update === controller;
    lastController = controller;
    if (!replacement) return;

    update = controller;
    clearActivationTimeout();
    if (applying) {
      reloadOnce();
      return;
    }
    publish(dismissed.has(controller) ? null : "ready");
  }

  function watch(worker: ServiceWorker | null) {
    if (!worker || workerListeners.has(worker)) return;
    const onStateChange = () => {
      reconcile();
      if (worker.state === "redundant" && update === worker) {
        if (applying) fail(attempt);
        else {
          update = null;
          publish(null);
        }
      }
    };
    workerListeners.set(worker, onStateChange);
    worker.addEventListener("statechange", onStateChange);
  }

  function reconcile() {
    if (disposed || reloading) return;
    onControllerChange();
    if (!registration || reloading) return;
    watch(registration.installing);
    watch(registration.waiting);
    if (registration.active?.state === "activating") watch(registration.active);

    const waiting = registration.waiting;
    if (
      waiting?.state === "installed" &&
      waiting !== serviceWorker.controller &&
      (registration.active || lastController)
    ) {
      update = waiting;
      if (!applying) publish(dismissed.has(waiting) ? null : "available");
    }
  }

  function attach(nextRegistration: ServiceWorkerRegistration | undefined) {
    if (disposed || !nextRegistration) return;
    if (registration !== nextRegistration) {
      registration?.removeEventListener("updatefound", reconcile);
      registration = nextRegistration;
      registration.addEventListener("updatefound", reconcile);
    }
    // Subscribe before inspecting: an update can already be installing or waiting.
    reconcile();
  }

  // Listen before registration awaits: another tab can activate during that await.
  serviceWorker.addEventListener("controllerchange", onControllerChange);
  void Promise.resolve()
    .then(register)
    .then(attach)
    .catch(() => undefined);
  void Promise.resolve()
    .then(() => serviceWorker.getRegistration("/"))
    .then(attach)
    .catch(() => undefined);

  function apply() {
    if (disposed || reloading || applying || !notice) return;
    if (notice.status === "ready") {
      reloadOnce();
      return;
    }

    applying = true;
    const activeAttempt = ++attempt;
    publish("updating");
    timeout = setTimeout(() => fail(activeAttempt), 15_000);

    void (async () => {
      try {
        const currentRegistration = await serviceWorker.getRegistration("/");
        if (disposed || reloading || !applying || activeAttempt !== attempt) return;
        attach(currentRegistration);
        if (reloading || !applying) return;
        if (!currentRegistration) {
          fail(activeAttempt);
          return;
        }

        const waiting = currentRegistration.waiting;
        if (waiting?.state === "installed") {
          update = waiting;
          // No reply is expected; controllerchange is the activation confirmation.
          waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          const active = currentRegistration.active;
          if (
            !active ||
            active === serviceWorker.controller ||
            (active.state !== "activating" && active.state !== "activated")
          ) {
            fail(activeAttempt);
          }
          // Another tab has started activation. Await its claim instead of reloading
          // while the old worker still controls this page.
        }
      } catch {
        fail(activeAttempt);
      }
    })();
  }

  function dismiss() {
    if (disposed) return;
    // Closing feedback does not revoke an update the user already approved.
    if (update) dismissed.add(update);
    publish(null);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    applying = false;
    attempt += 1;
    clearActivationTimeout();
    serviceWorker.removeEventListener("controllerchange", onControllerChange);
    registration?.removeEventListener("updatefound", reconcile);
    for (const [worker, listener] of workerListeners) {
      worker.removeEventListener("statechange", listener);
    }
    workerListeners.clear();
  }

  return { apply, dismiss, dispose };
}
