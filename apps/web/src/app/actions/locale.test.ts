import { LOCALE_COOKIE, localeCookieMaxAge } from "@repo/i18n";
import { beforeEach, expect, it, vi } from "vitest";
import { ROUTING_MODE_COOKIE } from "@/i18n/routing";
import { setLocalePreferences } from "./locale";

const preferences = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), read: vi.fn() }));
const settings = vi.hoisted(() => ({ demoEnabled: true, defaultMode: "always" }));
vi.mock("@/i18n/routing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/routing")>()),
  get DEFAULT_ROUTING_MODE() {
    return settings.defaultMode;
  },
  get ROUTING_DEMO_ENABLED() {
    return settings.demoEnabled;
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    preferences.read();
    return preferences;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  settings.demoEnabled = true;
  settings.defaultMode = "always";
});

it("saves language and a session-only routing override together", async () => {
  await setLocalePreferences({ locale: "es", mode: "never" });
  expect(preferences.set).toHaveBeenCalledWith(LOCALE_COOKIE, "es", {
    path: "/",
    maxAge: localeCookieMaxAge,
    sameSite: "lax",
  });
  expect(preferences.set).toHaveBeenCalledWith(ROUTING_MODE_COOKIE, "never", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
});

it("removes the override when selecting the project default", async () => {
  await setLocalePreferences({ locale: "en", mode: "always" });
  expect(preferences.delete).toHaveBeenCalledWith(ROUTING_MODE_COOKIE);
});

it.each([
  { locale: "fr", mode: "always" },
  { locale: "en", mode: "sometimes" },
])("rejects unsupported preferences before accessing cookies: %o", async (value) => {
  await expect(setLocalePreferences(value)).rejects.toThrow("Unsupported");
  expect(preferences.read).not.toHaveBeenCalled();
  expect(preferences.set).not.toHaveBeenCalled();
});

it.each(["always", "never"])(
  "enforces the fixed %s policy when the demo is disabled",
  async (mode) => {
    settings.demoEnabled = false;
    settings.defaultMode = mode;
    await expect(
      setLocalePreferences({ locale: "en", mode: mode === "always" ? "never" : "always" }),
    ).rejects.toThrow("Unsupported routing preference");
    expect(preferences.read).not.toHaveBeenCalled();
    await setLocalePreferences({ locale: "es", mode });
    expect(preferences.delete).toHaveBeenCalledWith(ROUTING_MODE_COOKIE);
  },
);
