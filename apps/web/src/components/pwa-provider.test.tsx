import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { Toaster } from "@repo/ui/components/toast";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaProvider } from "./pwa-provider";

const client = vi.hoisted(() => ({ current: { register: vi.fn(), messageSkipWaiting: vi.fn() } }));

vi.mock("@serwist/next/react", () => ({
  SerwistProvider: ({ children }: { children: ReactNode }) => children,
  useSerwist: () => ({ serwist: client.current }),
}));

class WorkerMock extends EventTarget {
  state: ServiceWorkerState = "installed";

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

  /** A newer worker finished installing behind the current waiting one. */
  replaceWaiting() {
    this.waiting = new WorkerMock().worker;
    act(() => this.dispatchEvent(new Event("updatefound")));
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

beforeEach(() => {
  vi.useFakeTimers();
  registration = new RegistrationMock();
  client.current = {
    register: vi.fn().mockResolvedValue(registration.registration),
    messageSkipWaiting: vi.fn(),
  };
  // A fresh container stands for a fresh document, so each test gets its own update session.
  const serviceWorker = Object.assign(new EventTarget(), { controller: registration.active });
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { serviceWorker }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe("localized PWA notifications", () => {
  it("registers once through Strict Mode replay and remounts, tolerating failure", async () => {
    client.current.register.mockRejectedValue(new Error("Registration denied"));
    const app = render(
      <StrictMode>
        <Application locale="en" />
      </StrictMode>,
    );
    await flush();
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

  it("translates one toast in place when the language changes", async () => {
    const app = render(<Application locale="en" />);
    await flush();
    expect(screen.getByText("Update available")).toBeVisible();
    const initialToast = document.querySelector('[data-slot="toast"]');

    app.rerender(<Application locale="es" />);
    expect(screen.getByText("Actualización disponible")).toBeVisible();
    expect(screen.getByRole("region", { name: "Notificaciones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cerrar notificación" })).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="toast"]')).toBe(initialToast);
    expect(client.current.register).toHaveBeenCalledOnce();
  });

  it("keeps an approval and its timeout across a locale remount", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(client.current.messageSkipWaiting).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    english.unmount();
    render(<Application locale="es" />);
    await flush();
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    const region = screen.getByRole("region", { name: "Notificaciones" });
    expect(within(region).getByText("No se pudo actualizar")).toBeVisible();
    act(() => region.focus());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(client.current.messageSkipWaiting).toHaveBeenCalledTimes(2);
    expect(client.current.register).toHaveBeenCalledOnce();
  });

  it("does not let a previous presenter close its replacement", async () => {
    const english = render(<Application locale="en" />);
    await flush();
    render(<Application locale="es" />);
    await flush();
    english.unmount();
    expect(screen.getByRole("button", { name: "Actualizar ahora" })).toBeVisible();
  });

  it("shares dismissal between locale subtrees retained by Activity, but offers newer workers", async () => {
    const app = render(<CachedApplication locale="en" />);
    await flush();
    expect(screen.getByRole("button", { name: "Update now" })).toBeVisible();
    app.rerender(<CachedApplication locale="es" />);
    await flush();
    expect(screen.queryByRole("button", { name: "Update now" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    await flush();

    // The English Toaster kept a stale toast while hidden; its presenter closes it on reveal.
    app.rerender(<CachedApplication locale="en" />);
    await flush();
    expect(screen.queryByRole("button", { name: "Update now" })).not.toBeInTheDocument();
    registration.replaceWaiting();
    expect(screen.getByRole("button", { name: "Update now" })).toBeVisible();
    expect(client.current.register).toHaveBeenCalledOnce();
  });
});
