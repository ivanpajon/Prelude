import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SiteIdentity } from "@/site";
import { SiteFooter } from "./site-footer";

const site = vi.hoisted(
  (): SiteIdentity => ({
    name: "Acme",
    slug: "acme",
    logo: { src: "/branding/logo.png", width: 100, height: 40 },
  }),
);
vi.mock("@/site", () => ({ site }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name: string }) =>
    key === "repository" ? `${values?.name} source code` : key,
}));

describe("site footer", () => {
  it("renders no repository link when the project has no repository URL", async () => {
    site.repositoryUrl = undefined;
    render(await SiteFooter());
    expect(screen.getByText("footer")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the configured repository in a new tab", async () => {
    site.repositoryUrl = "https://example.com/acme/app";
    render(await SiteFooter());
    const link = screen.getByRole("link", { name: "Acme source code" });
    expect(link).toHaveAttribute("href", "https://example.com/acme/app");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
