import { getPwaMessages } from "@repo/i18n/pwa";
import { describe, expect, it, vi } from "vitest";
import { site } from "@/site";
import manifest from "./manifest";

const requestLocale = vi.hoisted(() => vi.fn());
vi.mock("../i18n/http-locale", () => ({ getRequestLocale: requestLocale }));

describe("localized installation manifest", () => {
  it("translates presentation while preserving application identity and launch URLs", async () => {
    requestLocale.mockResolvedValueOnce("en").mockResolvedValueOnce("es");
    const english = await manifest();
    const spanish = await manifest();
    expect(english.lang).toBe("en");
    expect(spanish.lang).toBe("es");
    expect(english.description).toBe(getPwaMessages("en").Pwa.manifestDescription);
    expect(spanish.description).toBe(getPwaMessages("es").Pwa.manifestDescription);
    for (const result of [english, spanish]) {
      expect(result).toMatchObject({
        id: "/",
        name: site.name,
        short_name: site.name,
        start_url: "/",
        scope: "/",
        dir: "ltr",
        display: "standalone",
        theme_color: site.colors.theme,
        background_color: site.colors.background,
      });
    }
    expect(spanish.icons).toEqual(english.icons);
  });
});
