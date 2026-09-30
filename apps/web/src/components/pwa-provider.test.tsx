import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { Toaster } from "@repo/ui/components/toast";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaProvider } from "./pwa-provider";

const client = vi.hoisted(() => ({ current: { register: vi.fn() } }));

vi.mock("@serwist/next/react", () => ({
  SerwistProvider: ({ children }: { children: ReactNode }) => children,
  useSerwist: () => ({ serwist: client.current }),
}));

class WorkerMock extends EventTarget {
  state: ServiceWorkerState = "installed";
  postMessage = vi.fn();

  get worker() {
    return this as unknown as ServiceWorker;
  }
}

class RegistrationMock extends EventTarget {
  active = new WorkerMock().worker;
  waiting: ServiceWorker | null = new WorkerMock().worker;
  installing: ServiceWorker | null = null;

  get registration() {
    return this as unknown as ServiceWorkerRegistration;
  }
}

class ContainerMock extends EventTarget {
  controller: ServiceWorker | null;
  getRegistration = vi.fn();

  constructor(registration: RegistrationMock) {
    super();
    this.controller = registration.active;
    this.getRegistration.mockResolvedValue(registration.registration);
  }
}

function Application({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Toaster dismissLabel={messages.Pwa.toastClose} regionLabel={messages.Pwa.toastRegion} />
      <PwaProvider>Application</PwaProvider>
    </NextIntlClientProvider>
  );
}

function CachedApplication({ locale }: { locale: Locale }) {
  return (
    <>
      <Activity mode={locale === "en" ? "visible" : "hidden"}>
        <Application locale="en" />
      </Activity>
      <Activity mode={locale === "es" ? "visible" : "hidden"}>
        <Application locale="es" />
      </Activity>
    </>
  );
}

let registration: RegistrationMock;
let container: ContainerMock;

beforeEach(() => {
  vi.useFakeTimers();
  client.current = { register: vi.fn() };
  registration = new RegistrationMock();
  container = new ContainerMock(registration);
  client.current.register.mockResolvedValue(registration.registration);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { serviceWorker: container }));
});

afterEach(() => {
  act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe("localized PWA notifications", () => {
  it("registers once through Strict Mode replay and retains failed attempts across remounts", async () => {
    client.current.register.mockRejectedValue(new Error("Registration denied"));
    container.getRegistration.mockResolvedValue(undefined);
    const app = render(
      <StrictMode>
        <Application locale="en" />
      </StrictMode>,
    );
    await flush();
    expect(client.current.register).toHaveBeenCalledOnce();
    app.unmount();
    render(
      <StrictMode>
        <Application locale="es" />
      </StrictMode>,
    );
    await flush();
    expect(client.current.register).toHaveBeenCalledOnce();
    expect(screen.queryByText("Actualización disponible")).not.toBeInTheDocument();
  });

  it("updates one toast in place without registering or re-observing the worker", async () => {
    const app = render(<Application locale="en" />);
    await flush();
    expect(screen.getByText("Update available")).toBeVisible();
    const initialToast = document.querySelector('[data-slot="toast"]');
    const initialLookups = container.getRegistration.mock.calls.length;
    const initialRegistrations = client.current.register.mock.calls.length;

    app.rerender(<Application locale="es" />);
    expect(screen.getByText("Actualización disponible")).toBeVisible();
    expect(screen.getByRole("region", { name: "Notificaciones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cerrar notificación" })).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="toast"]')).toBe(initialToast);
    expect(container.getRegistration).toHaveBeenCalledTimes(initialLookups);
    expect(client.current.register).toHaveBeenCalledTimes(initialRegistrations);
  });

  it("preserves an approved activation and its timeout when the language changes", async () => {
    const app = render(<Application locale="en" />);
    await flush();
    const worker = registration.waiting as unknown as WorkerMock;
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    await flush();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    app.rerender(<Application locale="es" />);
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(
      within(screen.getByRole("region", { name: "Notificaciones" })).getByText(
        "No se pudo actualizar",
      ),
    ).toBeVisible();
    expect(worker.postMessage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await flush();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
  });

  it("keeps a dismissed worker suppressed across language changes and announces newer workers", async () => {
    const app = render(<Application locale="en" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await flush();
    app.rerender(<Application locale="es" />);
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.queryByText("Actualización disponible")).not.toBeInTheDocument();

    registration.waiting = new WorkerMock().worker;
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.getByText("Actualización disponible")).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  });

  it("reuses the document session when a different locale provider mounts", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    const initialLookups = container.getRegistration.mock.calls.length;
    const originalClient = client.current;
    english.unmount();
    client.current = { register: vi.fn().mockResolvedValue(registration.registration) };
    render(<Application locale="es" />);
    await flush();
    expect(screen.getByText("Actualización disponible")).toBeVisible();
    expect(container.getRegistration).toHaveBeenCalledTimes(initialLookups);
    expect(originalClient.register).toHaveBeenCalledOnce();
    expect(client.current.register).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  });

  it("shares dismissal between locale subtrees retained by Activity", async () => {
    const app = render(<CachedApplication locale="en" />);
    await flush();
    expect(screen.getByRole("button", { name: "Update now" })).toBeVisible();
    app.rerender(<CachedApplication locale="es" />);
    await flush();
    expect(screen.getByRole("button", { name: "Actualizar ahora" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Update now" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    await flush();

    app.rerender(<CachedApplication locale="en" />);
    await flush();
    expect(screen.queryByRole("button", { name: "Update now" })).not.toBeInTheDocument();
    expect(client.current.register).toHaveBeenCalledOnce();
    expect(container.getRegistration).toHaveBeenCalledOnce();
    registration.waiting = new WorkerMock().worker;
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.getByRole("button", { name: "Update now" })).toBeVisible();
  });

  it("does not let a previous presenter close or dismiss its replacement", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    const spanish = render(<Application locale="es" />);
    await flush();
    english.unmount();
    expect(screen.getByRole("button", { name: "Actualizar ahora" })).toBeVisible();

    spanish.unmount();
    render(<Application locale="en" />);
    await flush();
    expect(screen.getByRole("button", { name: "Update now" })).toBeVisible();
    expect(client.current.register).toHaveBeenCalledOnce();
  });

  it("retains approval and the original activation timeout across a locale remount", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    const worker = registration.waiting as unknown as WorkerMock;
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    english.unmount();
    render(<Application locale="es" />);
    await flush();
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
    expect(worker.postMessage).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(
      within(screen.getByRole("region", { name: "Notificaciones" })).getByText(
        "No se pudo actualizar",
      ),
    ).toBeVisible();
    act(() => screen.getByRole("region", { name: "Notificaciones" }).focus());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await flush();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(client.current.register).toHaveBeenCalledOnce();
  });

  it("retains dismissal across locale remounts while still detecting a newer worker", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await flush();
    english.unmount();
    render(<Application locale="es" />);
    await flush();
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.queryByText("Actualización disponible")).not.toBeInTheDocument();

    registration.waiting = new WorkerMock().worker;
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.getByText("Actualización disponible")).toBeVisible();
    expect(client.current.register).toHaveBeenCalledOnce();
  });

  it("preserves a cached document but disposes worker listeners and timers when it is destroyed", async () => {
    const removeControllerListener = vi.spyOn(container, "removeEventListener");
    const removeRegistrationListener = vi.spyOn(registration, "removeEventListener");
    const worker = registration.waiting as unknown as WorkerMock;
    const removeWorkerListener = vi.spyOn(worker, "removeEventListener");
    const removePageListener = vi.spyOn(window, "removeEventListener");
    const english = render(<Application locale="en" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    await flush();

    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    expect(removeControllerListener).not.toHaveBeenCalled();
    english.unmount();
    render(<Application locale="es" />);
    await flush();
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();

    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    expect(removeControllerListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    expect(removeRegistrationListener).toHaveBeenCalledWith("updatefound", expect.any(Function));
    expect(removeWorkerListener).toHaveBeenCalledWith("statechange", expect.any(Function));
    expect(removePageListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.queryByText("No se pudo actualizar")).not.toBeInTheDocument();
    registration.waiting = new WorkerMock().worker;
    act(() => registration.dispatchEvent(new Event("updatefound")));
    expect(screen.queryByText("Actualización disponible")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
