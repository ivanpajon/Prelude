import { describe, expect, it } from "vitest";
import { browserLocale, isLocale, locales, requestLocale, resolveLocale } from "./index";
import { getMessages } from "./messages";
import { getWidgetMessages } from "./widget";

function leaves(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, child]): [string, string][] => {
    const path = `${prefix}${key}`;
    return typeof child === "object" && child !== null
      ? leaves(child, `${path}.`)
      : [[path, String(child)]];
  });
}

function keys(value: object): string[] {
  return leaves(value)
    .map(([path]) => path)
    .sort();
}

/**
 * ICU argument names and rich-text tags. `\s*[,}]` skips multi-word plural and select branch
 * text; a one-word branch such as `{None}` reads as an argument, so phrase it as `{No tasks}`.
 */
function placeholders(message: string): string[] {
  const matches = message.matchAll(/\{\s*(\w+)\s*[,}]|<(\w+)>/g);
  return [...new Set([...matches].map((match) => match[1] ?? `<${match[2]}>`))].sort();
}

describe("locale selection", () => {
  it("validates saved locales and matches regional browser preferences", () => {
    for (const locale of locales) expect(isLocale(locale)).toBe(true);
    for (const value of ["es-MX", "fr", "", "EN", undefined]) expect(isLocale(value)).toBe(false);
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

  it("uses the same ICU arguments and rich-text tags in every locale", () => {
    for (const get of [getMessages, getWidgetMessages]) {
      const spanish = new Map(leaves(get("es")));
      for (const [key, english] of leaves(get("en"))) {
        expect(placeholders(spanish.get(key) ?? ""), key).toEqual(placeholders(english));
      }
    }
  });
});
