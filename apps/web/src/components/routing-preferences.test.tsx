import { getMessages } from "@repo/i18n/messages";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link } from "@/i18n/navigation";
import { ROUTING_DEMO_ENABLED, type RoutingMode } from "@/i18n/routing";
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
        <Link href="/about">About</Link>
      </RoutingPreferenceProvider>
    </NextIntlClientProvider>
  );
}

/** jsdom cannot load pages, so record full page loads instead. */
function stubPageLoads() {
  const location = { href: window.location.href, assign: vi.fn(), reload: vi.fn() };
  vi.stubGlobal("location", location);
  return location;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/en");
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("routing preference controls", () => {
  it.each([
    ["always", "en", "/en/about", true],
    ["always", "es", "/es/about", true],
    ["never", "en", "/about", false],
    ["never", "es", "/about", false],
  ] as const)(
    "renders static %s/%s links and disabled controls before hydration",
    (mode, locale, href, checked) => {
      const html = renderToString(<Controls mode={mode} locale={locale} />);
      expect(html).toContain(`href="${href}"`);
      if (ROUTING_DEMO_ENABLED) expect(html).toContain(`aria-checked="${checked}"`);
      else expect(html).not.toContain('role="switch"');
      expect(html).toMatch(/<select[^>]*disabled/);
    },
  );

  it("changes languages through explicit routes while retaining query and fragment", async () => {
    window.history.replaceState(null, "", "/en/about?status=completed#details");
    render(<Controls />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/es/about?status=completed#details", {
        scroll: false,
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "always" });
  });

  it("refreshes language changes in hidden mode without adding a prefix", async () => {
    window.history.replaceState(null, "", "/about?status=active#details");
    render(<Controls mode="never" />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({ locale: "es", mode: "never" });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows an error and stays on the page when a language change fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Network failure"));
    const location = stubPageLoads();
    render(<Controls />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t update your language preferences",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it.each([
    ["always", "/en/about?status=completed#details", "/es/about?status=completed#details"],
    ["never", "/about?status=active#details", undefined],
  ] as const)(
    "reloads in %s mode when a new deploy no longer knows the action, then applies the choice once",
    async (mode, start, destination) => {
      window.history.replaceState(null, "", start);
      mocks.save.mockRejectedValueOnce(new UnrecognizedActionError("Server Action was not found"));
      const location = stubPageLoads();
      const { unmount } = render(<Controls mode={mode} />);
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
      await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1));
      expect(location.assign).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      unmount();

      // The reloaded page runs the new build and saves the same choice again.
      render(<Controls mode={mode} />);
      await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
      expect(mocks.save).toHaveBeenLastCalledWith({ locale: "es", mode });
      if (destination) {
        await waitFor(() =>
          expect(mocks.replace).toHaveBeenCalledWith(destination, { scroll: false }),
        );
      } else {
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      }
      expect(sessionStorage.length).toBe(0);
      expect(location.reload).toHaveBeenCalledTimes(1);
    },
  );

  it("reloads only once and then shows the error when the reloaded page still does not know the action", async () => {
    mocks.save.mockRejectedValue(new UnrecognizedActionError("Server Action was not found"));
    const location = stubPageLoads();
    const { unmount } = render(<Controls />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1));
    unmount();

    // The reloaded page still holds stale action IDs, so the retry fails the same way.
    render(<Controls />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t update your language preferences",
    );
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });
});

// `routingSettings.demoEnabled: false` removes the switch from the header, so these cases have
// nothing to test. They run again as soon as the setting shows the switch.
describe.skipIf(!ROUTING_DEMO_ENABLED)(
  "Language in URL switch (skipped while routingSettings.demoEnabled is false)",
  () => {
    it("removes the prefix by keyboard, preserving the selected locale, query, fragment and scroll", async () => {
      window.history.replaceState(null, "", "/es/about?status=active#details");
      const user = userEvent.setup();
      render(<Controls locale="es" />);
      const control = screen.getByRole("switch", { name: "Idioma en la URL" });
      control.focus();
      await user.keyboard(" ");
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/about?status=active#details", {
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
  },
);
