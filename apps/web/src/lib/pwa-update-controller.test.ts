import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPwaUpdateController, type PwaUpdateNotice } from "./pwa-update-controller";

class WorkerMock extends EventTarget {
  // Versions deliberately share a URL: identity, not scriptURL, identifies an update.
  readonly scriptURL = "http://localhost/sw.js";
  readonly postMessage = vi.fn();

  constructor(public state: ServiceWorkerState = "activated") {
    super();
  }

  get worker() {
    return this as unknown as ServiceWorker;
  }

  transition(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class RegistrationMock extends EventTarget {
  active: ServiceWorker | null = null;
  waiting: ServiceWorker | null = null;
  installing: ServiceWorker | null = null;
  readonly update = vi.fn();

  get registration() {
    return this as unknown as ServiceWorkerRegistration;
  }

  install(worker: WorkerMock) {
    this.installing = worker.worker;
    this.dispatchEvent(new Event("updatefound"));
  }

  finishInstallation(worker: WorkerMock) {
    this.installing = null;
    this.waiting = worker.worker;
    worker.transition("installed");
  }
}

class ContainerMock extends EventTarget {
  controller: ServiceWorker | null = null;
  readonly getRegistration =
    vi.fn<(url?: string) => Promise<ServiceWorkerRegistration | undefined>>();

  get container() {
    return this as unknown as ServiceWorkerContainer;
  }

  claim(worker: WorkerMock) {
    this.controller = worker.worker;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

const controllers: ReturnType<typeof createPwaUpdateController>[] = [];

function fixture({
  firstInstall = false,
  registration = new RegistrationMock(),
  active = new WorkerMock(),
}: {
  firstInstall?: boolean;
  registration?: RegistrationMock;
  active?: WorkerMock;
} = {}) {
  const container = new ContainerMock();
  if (!firstInstall) {
    container.controller = active.worker;
    registration.active = active.worker;
  }
  container.getRegistration.mockResolvedValue(registration.registration);
  const register = vi.fn(async () => registration.registration);
  const onChange = vi.fn<(notice: PwaUpdateNotice | null) => void>();
  const reload = vi.fn();
  const controller = createPwaUpdateController({
    serviceWorker: container.container,
    register,
    onChange,
    reload,
  });
  controllers.push(controller);
  return { container, registration, active, register, onChange, reload, controller };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function makeAvailable(registration: RegistrationMock) {
  const worker = new WorkerMock("installing");
  registration.install(worker);
  registration.finishInstallation(worker);
  return worker;
}

function activate(registration: RegistrationMock, container: ContainerMock, worker: WorkerMock) {
  registration.waiting = null;
  registration.active = worker.worker;
  worker.transition("activating");
  container.claim(worker);
  worker.transition("activated");
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
});

describe("PWA update lifecycle", () => {
  it("keeps first installation silent and recognizes later browser-discovered updates", async () => {
    const context = fixture({ firstInstall: true });
    await flush();
    const first = makeAvailable(context.registration);
    activate(context.registration, context.container, first);
    expect(context.onChange).not.toHaveBeenCalled();
    expect(context.reload).not.toHaveBeenCalled();

    makeAvailable(context.registration);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "available" });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(context.register).toHaveBeenCalledOnce();
    expect(context.registration.update).not.toHaveBeenCalled();
    expect(context.container.getRegistration).toHaveBeenCalledOnce();
  });

  it("detects an already-waiting worker once, including after a provider remount", async () => {
    const context = fixture();
    context.registration.waiting = new WorkerMock("installed").worker;
    await flush();
    expect(context.onChange).toHaveBeenCalledExactlyOnceWith({ status: "available" });
    context.controller.dispose();

    const remounted = fixture({ registration: context.registration, active: context.active });
    await flush();
    expect(remounted.onChange).toHaveBeenCalledExactlyOnceWith({ status: "available" });
  });

  it("subscribes to a worker that was installing before observation started", async () => {
    const context = fixture();
    const installing = new WorkerMock("installing");
    context.registration.installing = installing.worker;
    await flush();
    context.registration.finishInstallation(installing);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "available" });
  });

  it("continues observing successive external workers after an earlier dismissal", async () => {
    const context = fixture();
    await flush();
    const first = makeAvailable(context.registration);
    context.controller.dismiss();
    first.transition("installed");
    activate(context.registration, context.container, first);
    expect(context.onChange.mock.calls.map(([notice]) => notice?.status ?? null)).toEqual([
      "available",
      null,
    ]);

    makeAvailable(context.registration);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "available" });
    expect(context.reload).not.toHaveBeenCalled();
  });

  it("posts immediately on approval and reloads once only after the new worker controls", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    context.controller.apply();
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "updating" });
    await flush();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
    expect(context.reload).not.toHaveBeenCalled();

    activate(context.registration, context.container, worker);
    context.container.claim(worker);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(context.reload).toHaveBeenCalledOnce();
    expect(context.onChange).toHaveBeenLastCalledWith(null);
  });

  it("asks each tab before reload when one tab activates the shared update", async () => {
    const first = fixture();
    const second = fixture({ registration: first.registration, active: first.active });
    await flush();
    const worker = makeAvailable(first.registration);
    first.controller.apply();
    await flush();
    activate(first.registration, first.container, worker);
    second.container.claim(worker);

    expect(first.reload).toHaveBeenCalledOnce();
    expect(second.reload).not.toHaveBeenCalled();
    expect(second.onChange).toHaveBeenLastCalledWith({ status: "ready" });
    second.controller.apply();
    second.controller.apply();
    expect(second.reload).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledOnce();
  });

  it("suppresses a dismissed update when another tab activates it, then prompts for a newer one", async () => {
    const context = fixture();
    await flush();
    const dismissed = makeAvailable(context.registration);
    context.controller.dismiss();
    activate(context.registration, context.container, dismissed);
    expect(context.onChange).toHaveBeenLastCalledWith(null);
    expect(context.reload).not.toHaveBeenCalled();

    const newer = new WorkerMock();
    context.container.claim(newer);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "ready" });
    context.controller.dismiss();
    context.container.claim(newer);
    expect(context.onChange).toHaveBeenLastCalledWith(null);
  });

  it("observes control changes before the registration promise resolves", async () => {
    const context = fixture();
    let finishRegistration!: (registration: ServiceWorkerRegistration) => void;
    const delayed = new Promise<ServiceWorkerRegistration>((resolve) => {
      finishRegistration = resolve;
    });
    context.register.mockReturnValue(delayed);
    context.container.getRegistration.mockReturnValue(delayed);
    await flush();
    context.container.claim(new WorkerMock());
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "ready" });
    expect(context.reload).not.toHaveBeenCalled();
    finishRegistration(context.registration.registration);
    await flush();
  });

  it("waits for a concurrent activation instead of reloading under the old controller", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.registration.waiting = null;
    context.registration.active = worker.worker;
    worker.transition("activating");
    context.controller.apply();
    await flush();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(context.reload).not.toHaveBeenCalled();
    context.container.claim(worker);
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("remembers approval if another tab activates while the registration lookup is pending", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    let resolveLookup!: (registration: ServiceWorkerRegistration) => void;
    context.container.getRegistration.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    context.controller.apply();
    activate(context.registration, context.container, worker);
    expect(context.reload).toHaveBeenCalledOnce();
    resolveLookup(context.registration.registration);
    await flush();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("times out without falsely reporting success and allows a retry", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    await flush();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "updating" });
    await vi.advanceTimersByTimeAsync(1);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "error" });
    expect(context.reload).not.toHaveBeenCalled();

    context.controller.apply();
    await flush();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    activate(context.registration, context.container, worker);
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("requires fresh consent if activation arrives after the attempt timed out", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    await vi.advanceTimersByTimeAsync(15_000);
    activate(context.registration, context.container, worker);
    expect(context.reload).not.toHaveBeenCalled();
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "ready" });
  });

  it("keeps activation consent when the user closes the updating toast", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    await flush();
    context.controller.dismiss();
    expect(context.onChange).toHaveBeenLastCalledWith(null);
    activate(context.registration, context.container, worker);
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("does not reopen a dismissed updating toast on timeout, but permits a newer update", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    await flush();
    context.controller.dismiss();
    const callsAfterDismissal = context.onChange.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    worker.transition("installed");
    activate(context.registration, context.container, worker);
    expect(context.onChange).toHaveBeenCalledTimes(callsAfterDismissal);
    expect(context.reload).not.toHaveBeenCalled();
    makeAvailable(context.registration);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "available" });
  });

  it("reports a failed message send and permits dismissal without restarting the prompt", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    worker.postMessage.mockImplementation(() => {
      throw new Error("Blocked message");
    });
    context.controller.apply();
    await flush();
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "error" });
    context.controller.dismiss();
    worker.transition("installed");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(context.onChange).toHaveBeenLastCalledWith(null);
    expect(context.reload).not.toHaveBeenCalled();
  });

  it("reports an absent waiting worker instead of reloading the unchanged version", async () => {
    const context = fixture();
    await flush();
    makeAvailable(context.registration);
    context.registration.waiting = null;
    context.controller.apply();
    await flush();
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "error" });
    expect(context.reload).not.toHaveBeenCalled();
  });

  it("ignores stale asynchronous attempts after timeout and retry", async () => {
    const context = fixture();
    await flush();
    const worker = makeAvailable(context.registration);
    let resolveOldLookup!: (registration: ServiceWorkerRegistration) => void;
    context.container.getRegistration.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOldLookup = resolve;
        }),
    );
    context.controller.apply();
    await vi.advanceTimersByTimeAsync(15_000);
    context.controller.apply();
    await flush();
    resolveOldLookup(context.registration.registration);
    await flush();
    expect(worker.postMessage).toHaveBeenCalledOnce();
  });

  it("handles registration failures quietly and observes a usable existing registration", async () => {
    const context = fixture();
    context.register.mockRejectedValue(new Error("Registration blocked"));
    await flush();
    expect(context.onChange).not.toHaveBeenCalled();
    makeAvailable(context.registration);
    expect(context.onChange).toHaveBeenLastCalledWith({ status: "available" });
  });

  it("ignores late registration results and removes listeners and timers on disposal", async () => {
    const context = fixture();
    let finishRegistration!: (registration: ServiceWorkerRegistration) => void;
    context.register.mockReturnValue(
      new Promise((resolve) => {
        finishRegistration = resolve;
      }),
    );
    await flush();
    const worker = makeAvailable(context.registration);
    context.controller.apply();
    await flush();
    context.controller.dispose();
    context.controller.dispose();
    context.onChange.mockClear();

    finishRegistration(context.registration.registration);
    activate(context.registration, context.container, worker);
    makeAvailable(context.registration);
    await vi.advanceTimersByTimeAsync(15_000);
    context.controller.apply();
    context.controller.dismiss();
    expect(context.onChange).not.toHaveBeenCalled();
    expect(context.reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
