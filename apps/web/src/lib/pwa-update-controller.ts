export type PwaUpdateStatus = "available" | "updating" | "ready" | "error";

interface PwaUpdateControllerOptions {
  serviceWorker: ServiceWorkerContainer;
  /** The document's @serwist/window instance. */
  serwist: {
    register: () => Promise<ServiceWorkerRegistration | undefined>;
    messageSkipWaiting: () => void;
  };
  reload: () => void;
}

type PwaUpdateController = ReturnType<typeof createPwaUpdateController>;

// Locale Activity subtrees share the document's service-worker container, so they share its updates.
const controllers = new WeakMap<ServiceWorkerContainer, PwaUpdateController>();

export function getPwaUpdateController(options: PwaUpdateControllerOptions) {
  const existing = controllers.get(options.serviceWorker);
  if (existing) return existing;
  const controller = createPwaUpdateController(options);
  controllers.set(options.serviceWorker, controller);
  return controller;
}

/** Observe browser-discovered updates without polling or reloading unconsenting tabs. */
function createPwaUpdateController({ serviceWorker, serwist, reload }: PwaUpdateControllerOptions) {
  let status: PwaUpdateStatus | null = null;
  let update: ServiceWorker | null = null;
  let lastController = serviceWorker.controller;
  let registration: ServiceWorkerRegistration | undefined;
  let approved = false;
  let reloading = false;
  const dismissed = new WeakSet<ServiceWorker>();
  const listeners = new Set<(status: PwaUpdateStatus | null) => void>();

  function publish(next: PwaUpdateStatus | null) {
    if (reloading || next === status) return;
    status = next;
    for (const listener of listeners) listener(next);
  }

  function reloadOnce() {
    if (reloading) return;
    publish(null);
    reloading = true;
    reload();
  }

  function offer(worker: ServiceWorker, next: "available" | "ready") {
    update = worker;
    if (!approved) publish(dismissed.has(worker) ? null : next);
  }

  // @serwist/window stops reporting updates after the first external one, so watch natively.
  function inspect() {
    registration?.installing?.addEventListener("statechange", inspect);
    const waiting = registration?.waiting;
    // A waiting worker without an active one is the first installation.
    if (waiting && registration?.active) offer(waiting, "available");
  }

  // Listen before register() awaits the load event: another tab can activate meanwhile.
  serviceWorker.addEventListener("controllerchange", () => {
    const controller = serviceWorker.controller;
    // The first claim is installation, unless this page already offered that worker.
    const replacement = lastController !== null || controller === update;
    lastController = controller;
    if (!controller || !replacement) return;
    if (approved) reloadOnce();
    else offer(controller, "ready");
  });
  serwist
    .register()
    .then((current) => {
      registration = current;
      current?.addEventListener("updatefound", inspect);
      // Subscribe before inspecting: an update can already be installing or waiting.
      inspect();
    })
    .catch(() => undefined);

  function apply() {
    if (status === "ready") return reloadOnce();
    if (status !== "available" && status !== "error") return;
    approved = true;
    publish("updating");
    // Targets the waiting worker of the registration inspected above. No reply is expected:
    // controllerchange confirms activation, including one another tab started.
    serwist.messageSkipWaiting();
    setTimeout(() => {
      approved = false;
      publish(update && dismissed.has(update) ? null : "error");
    }, 15_000);
  }

  function dismiss() {
    // Programmatic toast closes land here too, after the notice is already gone.
    if (!status || !update) return;
    // Closing feedback does not revoke an update the user already approved.
    dismissed.add(update);
    publish(null);
  }

  return {
    apply,
    dismiss,
    getStatus: () => status,
    subscribe(listener: (status: PwaUpdateStatus | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
