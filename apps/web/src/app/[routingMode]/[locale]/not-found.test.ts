import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { site } from "@/site";
import { generateMetadata as catchAllMetadata } from "./[...rest]/page";
import { generateMetadata } from "./not-found";

const locale = vi.hoisted(() => ({ current: "en" as Locale }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: "Errors") =>
    createTranslator({ locale: locale.current, messages: getMessages(locale.current), namespace }),
}));

describe("not-found metadata", () => {
  it.each([
    ["en", `A fresh direction — ${site.name}`],
    ["es", `Un nuevo rumbo — ${site.name}`],
  ] as const)("gives the %s page its own title", async (current, title) => {
    locale.current = current;
    const metadata = await generateMetadata();
    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(getMessages(current).Errors.notFoundDescription);
  });

  it("uses the same metadata for unknown URLs", () => {
    expect(catchAllMetadata).toBe(generateMetadata);
  });
});
