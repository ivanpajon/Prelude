export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "PRELUDE_LOCALE";
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}

/** Match supported BCP 47 languages without trusting arbitrary cookie/host values. */
export function resolveLocale(...preferences: readonly (string | null | undefined)[]): Locale {
  for (const preference of preferences) {
    if (!preference) continue;
    try {
      const language = new Intl.Locale(preference).language;
      if (isLocale(language)) return language;
    } catch {
      // Invalid preferences are ignored so the next supported preference can win.
    }
  }
  return defaultLocale;
}

export function browserLocale(cookie: string, languages: readonly string[]): Locale {
  const saved = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return resolveLocale(isLocale(saved) ? saved : undefined, ...languages);
}

/** Parse weighted browser preferences for non-page routes, such as the manifest. */
export function requestLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const languages = (acceptLanguage ?? "")
    .split(",")
    .map((entry, order) => {
      const [language, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
      return { language, order, weight: quality ? Number(quality.trim().slice(2)) : 1 };
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  return resolveLocale(...languages.map(({ language }) => language));
}
