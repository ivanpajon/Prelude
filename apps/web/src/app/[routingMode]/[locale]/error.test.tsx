import { getMessages } from "@repo/i18n/messages";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

function renderError(locale: "en" | "es", digest?: string) {
  const retry = vi.fn();
  const error = Object.assign(new Error("private cause"), digest ? { digest } : {});
  render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="UTC">
      <ErrorPage error={error} retry={retry} />
    </NextIntlClientProvider>,
  );
  return retry;
}

describe("segment error page", () => {
  it("shows the digest as a translated reference code", () => {
    renderError("en", "1234567890");
    expect(screen.getByText("Reference: 1234567890")).toBeVisible();
    expect(screen.queryByText(/private cause/)).toBeNull();
  });

  it("translates the reference label and retries the segment", async () => {
    const retry = renderError("es", "42");
    expect(screen.getByText("Referencia: 42")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("omits the reference when the error has no digest", () => {
    renderError("en");
    expect(screen.queryByText(/Reference/)).toBeNull();
  });
});
