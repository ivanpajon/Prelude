import { describe, expect, it } from "vitest";
import { locales } from "./index";
import { getMessages } from "./messages";
import { getPwaMessages } from "./pwa";

describe("standalone PWA messages", () => {
  it("delivers only the website's PWA namespace in every language", () => {
    for (const locale of locales) {
      expect(Object.keys(getPwaMessages(locale))).toEqual(["Pwa"]);
      expect(getPwaMessages(locale).Pwa, locale).toEqual(getMessages(locale).Pwa);
    }
    expect(getPwaMessages("en").Pwa.offlineTitle).toBe("You’re offline.");
  });
});
