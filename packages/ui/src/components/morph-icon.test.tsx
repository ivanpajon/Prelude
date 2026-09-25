import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MorphIcon } from "./morph-icon";

const expanded = "M4 6h16M4 12h16M4 18h16";
const compact = "M4 12h16";

afterEach(() => vi.restoreAllMocks());

it("honors reduced motion by default when an icon changes", () => {
  const originalMatchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...originalMatchMedia(query),
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
  const requestFrame = vi.spyOn(window, "requestAnimationFrame");
  const { rerender } = render(<MorphIcon icon={expanded} label="List density" />);
  const originalPath = screen.getByRole("img", { name: "List density" }).querySelector("path");
  const before = originalPath?.getAttribute("d");

  rerender(<MorphIcon icon={compact} label="List density" />);

  expect(originalPath).toHaveAttribute("d", compact);
  expect(originalPath?.getAttribute("d")).not.toBe(before);
  expect(requestFrame).not.toHaveBeenCalled();
});

it("keeps decorative icons out of an action's accessible name", () => {
  const { container } = render(
    <button type="button">
      <MorphIcon icon={expanded} />
      Compact view
    </button>,
  );

  expect(screen.getByRole("button", { name: "Compact view" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
