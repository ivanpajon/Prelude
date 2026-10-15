import { getMessages } from "@repo/i18n/messages";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { RoutingPreferenceProvider } from "@/i18n/routing-preference-provider";
import { LanguageSelector } from "./language-selector";

// Simulate a site that keeps only English in `locales`.
vi.mock("@repo/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/i18n")>()),
  locales: ["en"],
}));
vi.mock("@/app/actions/locale", () => ({ setLocalePreferences: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe("language selector", () => {
  it("hides the language choice when the site has one language", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")} timeZone="UTC">
        <RoutingPreferenceProvider mode="always">
          <LanguageSelector />
        </RoutingPreferenceProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
