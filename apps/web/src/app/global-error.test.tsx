import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

describe("global error page", () => {
  it("renders its own document with neutral copy in both languages", () => {
    const html = renderToString(<GlobalError error={new Error("private cause")} retry={vi.fn()} />);
    expect(html).toMatch(/^<html lang="en">/);
    expect(html).toContain("Something went wrong.");
    expect(html).toContain('<p lang="es"');
    expect(html).toContain("Algo salió mal.");
    expect(html).not.toContain("private cause");
    expect(html).not.toContain("Reference");
  });

  it("shows the digest as a reference code and retries on request", async () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("private cause"), { digest: "4096" });
    render(<GlobalError error={error} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Something went wrong." })).toBeVisible();
    expect(screen.getByText(/: 4096$/)).toHaveTextContent("Reference · Referencia: 4096");
    await userEvent.click(screen.getByRole("button", { name: "Try again · Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
