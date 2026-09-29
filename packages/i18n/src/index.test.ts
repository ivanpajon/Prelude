import { describe, expect, it } from "vitest";
import { browserLocale, isLocale, requestLocale, resolveLocale } from "./index";
import { getMessages } from "./messages";
import { getWidgetMessages } from "./widget";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) => {
      const path = `${prefix}${key}`;
      return typeof child === "object" && child !== null ? keys(child, `${path}.`) : [path];
    })
    .sort();
}

describe("locale selection", () => {
  it("validates saved locales and matches regional browser preferences", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("es-MX")).toBe(false);
    expect(resolveLocale("fr", "es-MX", "en")).toBe("es");
    expect(resolveLocale("invalid_locale", "de")).toBe("en");
    expect(browserLocale("other=en; PRELUDE_LOCALE=es", ["en-US"])).toBe("es");
    expect(browserLocale("PRELUDE_LOCALE=invalid", ["es-ES"])).toBe("es");
  });

  it("honors valid cookies, weighted languages, and the English fallback", () => {
    expect(requestLocale("en", "es-ES,es;q=0.9")).toBe("en");
    expect(requestLocale("invalid", "en;q=0.4,es-MX;q=0.9")).toBe("es");
    expect(requestLocale(undefined, "es;q=0,en;q=0.5")).toBe("en");
    expect(requestLocale(undefined, "es;q=invalid,de;q=1")).toBe("en");
    expect(requestLocale(undefined, null)).toBe("en");
  });
});

describe("message catalogs", () => {
  it("keeps all website and widget keys aligned across locales", () => {
    expect(keys(getMessages("es"))).toEqual(keys(getMessages("en")));
    expect(keys(getWidgetMessages("es"))).toEqual(keys(getWidgetMessages("en")));
  });
});
