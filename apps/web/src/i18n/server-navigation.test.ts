import { expect, it, vi } from "vitest";
import { getPathname, redirect } from "./server-navigation";

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`Redirect:${href}`);
  }),
);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: redirectMock,
}));

it.each([
  ["always", "en", "/en/playground?status=active"],
  ["always", "es", "/es/playground?status=active"],
  ["never", "es", "/playground?status=active"],
] as const)("generates request-independent %s/%s server URLs", (mode, locale, expected) => {
  expect(
    getPathname(mode, { locale, href: { pathname: "/playground", query: { status: "active" } } }),
  ).toBe(expected);
});

it("redirects hidden-mode server navigation without forcing a locale prefix", () => {
  expect(() => redirect("never", { locale: "es", href: "/playground" })).toThrow(
    "Redirect:/playground",
  );
  expect(redirectMock).toHaveBeenCalledWith("/playground", undefined);
});
