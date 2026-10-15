import { defaultLocale, LOCALE_COOKIE, locales } from "@repo/i18n";
import { getPwaMessages } from "@repo/i18n/pwa";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site } from "@/site";
import { OfflineContent } from "./offline-content";

const fallback = getPwaMessages(defaultLocale).Pwa;

beforeEach(() => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("");
});

afterEach(() => {
  document.documentElement.removeAttribute("lang");
  document.title = "";
  vi.restoreAllMocks();
});

describe("static offline fallback", () => {
  it("renders the default language without browser state or JavaScript", () => {
    const document = renderToString(<OfflineContent />);
    expect(document).toContain(fallback.offlineTitle);
    expect(document).toContain('href="/"');
    for (const locale of locales.filter((locale) => locale !== defaultLocale)) {
      expect(document).not.toContain(getPwaMessages(locale).Pwa.offlineTitle);
    }
  });

  it("uses a saved language before browser preferences and updates document metadata", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`${LOCALE_COOKIE}=es`);
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "No tienes conexión." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/");
    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe(`Sin conexión — ${site.name}`);
  });

  it("matches the browser when the saved choice is invalid", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`${LOCALE_COOKIE}=invalid`);
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-MX"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "No tienes conexión." })).toBeVisible();
  });

  it("falls back to the default language for unsupported browser languages", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: fallback.offlineTitle })).toBeVisible();
    expect(document.documentElement.lang).toBe(defaultLocale);
    expect(document.title).toBe(`${fallback.offlineDocumentTitle} — ${site.name}`);
  });

  it("still matches browser language when cookie access is blocked", () => {
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new Error("Cookie access denied");
    });
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-ES"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "No tienes conexión." })).toBeVisible();
  });
});
