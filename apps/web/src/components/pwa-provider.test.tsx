import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { Toaster } from "@repo/ui/components/toast";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe("localized PWA notifications", () => {
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
    expect(screen.getByText("No se pudo actualizar")).toBeVisible();
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
});
