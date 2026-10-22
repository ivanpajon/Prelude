import { getMessages } from "@repo/i18n/messages";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme toggle", () => {
  it("switches the document between dark and light themes", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")} timeZone="UTC">
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(await screen.findByRole("menuitemradio", { name: "System" })).toBeChecked();
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();

    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
