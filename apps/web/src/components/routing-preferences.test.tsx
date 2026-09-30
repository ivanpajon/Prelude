import { getMessages } from "@repo/i18n/messages";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Link } from "@/i18n/navigation";
import type { RoutingMode } from "@/i18n/routing";
import { RoutingPreferenceProvider } from "@/i18n/routing-preference-provider";
import { LanguageSelector } from "./language-selector";
import { RoutingModeSwitch } from "./routing-mode-switch";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/locale", () => ({ setLocalePreferences: mocks.save }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh, prefetch: vi.fn() }),
  usePathname: () => window.location.pathname,
}));

function Controls({
  mode = "always",
  locale = "en",
}: {
  mode?: RoutingMode;
  locale?: "en" | "es";
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="UTC">
      <RoutingPreferenceProvider mode={mode}>
        <LanguageSelector />
        <RoutingModeSwitch />
        <Link href="/playground">Playground</Link>
      </RoutingPreferenceProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/en");
});

describe("routing preference controls", () => {
  it.each([
    ["always", "en", "/en/playground", true],
    ["always", "es", "/es/playground", true],
    ["never", "en", "/playground", false],
    ["never", "es", "/playground", false],
  ] as const)(
    "renders static %s/%s links and disabled controls before hydration",
    (mode, locale, href, checked) => {
      const html = renderToString(<Controls mode={mode} locale={locale} />);
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`aria-checked="${checked}"`);
      expect(html).toMatch(/<select[^>]*disabled/);
    },
  );

  it("removes the prefix by keyboard, preserving the selected locale, query, fragment and scroll", async () => {
    window.history.replaceState(null, "", "/es/playground?status=active#tasks");
    const user = userEvent.setup();
    render(<Controls locale="es" />);
    const control = screen.getByRole("switch", { name: "Idioma en la URL" });
    control.focus();
    await user.keyboard(" ");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/playground?status=active#tasks", {
        scroll: false,
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "never" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("adds the current locale prefix and preserves URL state", async () => {
    window.history.replaceState(null, "", "/?source=demo#stack");
    render(<Controls mode="never" locale="es" />);
    await userEvent.click(screen.getByRole("switch", { name: "Idioma en la URL" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/es?source=demo#stack", { scroll: false }),
    );
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "always" });
  });

  it("changes languages through explicit routes while retaining query and fragment", async () => {
    window.history.replaceState(null, "", "/en/playground?status=completed#tasks");
    render(<Controls />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/es/playground?status=completed#tasks", {
        scroll: false,
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "always" });
  });

  it("refreshes language changes in hidden mode without adding a prefix", async () => {
    window.history.replaceState(null, "", "/playground?status=active#tasks");
    render(<Controls mode="never" />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "never" });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("coordinates both controls and rejects duplicate requests while a preference is being saved", async () => {
    let finish = () => {};
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Controls />);
    const control = screen.getByRole("switch", { name: "Language in URL" });
    const language = screen.getByRole("combobox", { name: "Language" });
    fireEvent.click(control);
    fireEvent.click(control);
    expect(language).toBeDisabled();
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(language).toBeEnabled());
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("retains the selected mode after a failed save and allows retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Network failure"));
    render(<Controls />);
    const control = screen.getByRole("switch", { name: "Language in URL" });
    await userEvent.click(control);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t update your language preferences",
    );
    expect(control).toBeChecked();
    expect(mocks.replace).not.toHaveBeenCalled();
    await userEvent.click(control);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/", { scroll: false }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
