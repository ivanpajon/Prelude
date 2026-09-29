import { LOCALE_COOKIE } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineContent } from "./offline-content";

beforeEach(() => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("");
});

afterEach(() => {
  document.documentElement.lang = "en";
  vi.restoreAllMocks();
});

describe("static offline fallback", () => {
  it("renders readable English without browser state or JavaScript", () => {
    const document = renderToString(<OfflineContent />);
    expect(document).toContain("You’re offline.");
    expect(document).toContain('href="/"');
    expect(document).not.toContain("No tienes conexión.");
  });

  it("uses a saved language before browser preferences and updates document metadata", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`${LOCALE_COOKIE}=es`);
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "No tienes conexión." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/");
    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe("Sin conexión — Prelude");
  });

  it("matches the browser when the saved choice is invalid", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(`${LOCALE_COOKIE}=invalid`);
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-MX"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "No tienes conexión." })).toBeVisible();
  });

  it("falls back to English for unsupported browser languages", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    render(<OfflineContent />);
    expect(screen.getByRole("heading", { name: "You’re offline." })).toBeVisible();
    expect(document.documentElement.lang).toBe("en");
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
