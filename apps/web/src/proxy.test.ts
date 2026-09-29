import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "./proxy";

describe("locale proxy", () => {
  it("rewrites the unchanged public URL using browser language", () => {
    const response = proxy(
      new NextRequest("http://localhost/playground?status=active", {
        headers: { "accept-language": "es-ES,es;q=0.9,en;q=0.8" },
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/es/playground?status=active",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("link")).toBe(false);
  });

  it("prefers a saved language and falls back from an invalid cookie", () => {
    for (const [cookie, expected] of [
      ["en", "en"],
      ["invalid", "es"],
    ]) {
      const response = proxy(
        new NextRequest("http://localhost/", {
          headers: { cookie: `PRELUDE_LOCALE=${cookie}`, "accept-language": "es" },
        }),
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(`http://localhost/${expected}`);
    }
  });
});
