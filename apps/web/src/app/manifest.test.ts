import { describe, expect, it, vi } from "vitest";
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
    expect(english.description).toBe("A connected starting point for your next project.");
    expect(spanish.description).toBe("Un punto de partida conectado para tu próximo proyecto.");
    for (const result of [english, spanish]) {
      expect(result).toMatchObject({
        id: "/",
        name: "Prelude",
        short_name: "Prelude",
        start_url: "/",
        scope: "/",
        dir: "ltr",
        display: "standalone",
      });
    }
    expect(spanish.icons).toEqual(english.icons);
  });
});
