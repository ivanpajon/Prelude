import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPwaUpdateController } from "./pwa-update-controller";

class WorkerMock extends EventTarget {
  // Versions deliberately share a URL: identity, not scriptURL, identifies an update.
  readonly scriptURL = "http://localhost/sw.js";

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
}

class ContainerMock extends EventTarget {
  controller: ServiceWorker | null = null;

  get container() {
    return this as unknown as ServiceWorkerContainer;
  }

  claim(worker: WorkerMock) {
    this.controller = worker.worker;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

function fixture({
  installed = true,
  controlled = installed,
  registered = Promise.resolve(),
}: {
  installed?: boolean;
  /** False for a hard reload, which bypasses an installed worker. */
  controlled?: boolean;
  registered?: Promise<void>;
} = {}) {
  const container = new ContainerMock();
  const registration = new RegistrationMock();
  const active = new WorkerMock();
  if (installed) registration.active = active.worker;
  if (controlled) container.controller = active.worker;
  const serwist = {
    register: vi.fn(async () => {
      await registered;
      return registration.registration;
    }),
    messageSkipWaiting: vi.fn(),
  };
  const reload = vi.fn();
  const controller = getPwaUpdateController({
    serviceWorker: container.container,
    serwist,
    reload,
  });
  return { container, registration, serwist, reload, controller };
}

type Fixture = ReturnType<typeof fixture>;

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function install({ registration }: Fixture) {
  const worker = new WorkerMock("installing");
  registration.installing = worker.worker;
  registration.dispatchEvent(new Event("updatefound"));
  registration.installing = null;
  registration.waiting = worker.worker;
  worker.transition("installed");
  return worker;
}

function activate({ registration, container }: Fixture, worker: WorkerMock) {
  registration.waiting = null;
  registration.active = worker.worker;
  worker.transition("activating");
  container.claim(worker);
  worker.transition("activated");
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("PWA update lifecycle", () => {
  it("keeps first installation silent and keeps reporting every later update", async () => {
    const context = fixture({ installed: false });
    await flush();
    activate(context, install(context));
    expect(context.controller.getStatus()).toBeNull();

    // @serwist/window stops reporting after its first external update; this must not.
    for (let index = 0; index < 3; index++) {
      install(context);
      expect(context.controller.getStatus()).toBe("available");
      context.controller.dismiss();
      expect(context.controller.getStatus()).toBeNull();
    }
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(context.serwist.register).toHaveBeenCalledOnce();
    expect(context.registration.update).not.toHaveBeenCalled();
    expect(context.reload).not.toHaveBeenCalled();
  });

  it("reports updates that were waiting or installing before registration resolved", async () => {
    const waiting = fixture();
    waiting.registration.waiting = new WorkerMock("installed").worker;
    const installing = fixture();
    const worker = new WorkerMock("installing");
    installing.registration.installing = worker.worker;
    await flush();
    expect(waiting.controller.getStatus()).toBe("available");
    expect(installing.controller.getStatus()).toBeNull();
    installing.registration.installing = null;
    installing.registration.waiting = worker.worker;
    worker.transition("installed");
    expect(installing.controller.getStatus()).toBe("available");
  });

  it("asks once to skip waiting and reloads once after the new worker controls", async () => {
    const context = fixture();
    await flush();
    const worker = install(context);
    context.controller.apply();
    context.controller.apply();
    expect(context.controller.getStatus()).toBe("updating");
    expect(context.serwist.messageSkipWaiting).toHaveBeenCalledOnce();
    expect(context.reload).not.toHaveBeenCalled();

    activate(context, worker);
    context.container.claim(new WorkerMock());
    await vi.advanceTimersByTimeAsync(15_000);
    expect(context.reload).toHaveBeenCalledOnce();
    expect(context.controller.getStatus()).toBeNull();
  });

  it("treats an approved update's first claim of a hard-reloaded page as the update", async () => {
    const context = fixture({ controlled: false });
    await flush();
    const worker = install(context);
    expect(context.controller.getStatus()).toBe("available");
    context.controller.apply();
    activate(context, worker);
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("asks before reloading when another tab activates an update, even mid-registration", async () => {
    const context = fixture({ registered: new Promise(() => undefined) });
    await flush();
    context.container.claim(new WorkerMock());
    expect(context.controller.getStatus()).toBe("ready");
    expect(context.reload).not.toHaveBeenCalled();

    context.controller.apply();
    context.controller.apply();
    expect(context.reload).toHaveBeenCalledOnce();
    expect(context.serwist.messageSkipWaiting).not.toHaveBeenCalled();
  });

  it("stays quiet when another tab activates a dismissed update", async () => {
    const context = fixture();
    await flush();
    const dismissed = install(context);
    context.controller.dismiss();
    activate(context, dismissed);
    expect(context.controller.getStatus()).toBeNull();
    expect(context.reload).not.toHaveBeenCalled();
  });

  it("times out to a retryable error without reloading", async () => {
    const context = fixture();
    await flush();
    const worker = install(context);
    context.controller.apply();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(context.controller.getStatus()).toBe("updating");
    await vi.advanceTimersByTimeAsync(1);
    expect(context.controller.getStatus()).toBe("error");
    expect(context.reload).not.toHaveBeenCalled();

    context.controller.apply();
    expect(context.serwist.messageSkipWaiting).toHaveBeenCalledTimes(2);
    activate(context, worker);
    expect(context.reload).toHaveBeenCalledOnce();
  });

  it("requires fresh consent if activation arrives after the attempt timed out", async () => {
    const context = fixture();
    await flush();
    const worker = install(context);
    context.controller.apply();
    await vi.advanceTimersByTimeAsync(15_000);
    activate(context, worker);
    expect(context.reload).not.toHaveBeenCalled();
    expect(context.controller.getStatus()).toBe("ready");
  });

  it("keeps consent when the updating notice is closed, without reopening it on timeout", async () => {
    const activated = fixture();
    const abandoned = fixture();
    await flush();
    const worker = install(activated);
    install(abandoned);
    for (const { controller } of [activated, abandoned]) {
      controller.apply();
      controller.dismiss();
      expect(controller.getStatus()).toBeNull();
    }
    activate(activated, worker);
    expect(activated.reload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(abandoned.controller.getStatus()).toBeNull();
    expect(abandoned.reload).not.toHaveBeenCalled();
  });
});
