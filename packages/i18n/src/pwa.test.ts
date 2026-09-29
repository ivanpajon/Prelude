import { describe, expect, it } from "vitest";
import { getPwaMessages } from "./pwa";

describe("standalone PWA messages", () => {
  it("delivers only the PWA namespace in either language", () => {
    expect(Object.keys(getPwaMessages("en"))).toEqual(["Pwa"]);
    expect(Object.keys(getPwaMessages("es"))).toEqual(["Pwa"]);
    expect(getPwaMessages("en").Pwa.offlineTitle).toBe("You’re offline.");
    expect(getPwaMessages("es").Pwa.offlineTitle).toBe("No tienes conexión.");
    expect(Object.keys(getPwaMessages("es").Pwa)).toEqual(Object.keys(getPwaMessages("en").Pwa));
  });
});
