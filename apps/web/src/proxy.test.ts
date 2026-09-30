import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import proxy from "./proxy";

describe("locale proxy", () => {
  beforeEach(() => {
    // The installed Next.js adapter enables this flag for skipProxyUrlNormalize.
    vi.stubEnv("__NEXT_NO_MIDDLEWARE_URL_NORMALIZE", "1");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps loopback IP rewrites on the incoming origin", () => {
    const response = proxy(
      new NextRequest("http://127.0.0.1:3100/playground", {
        headers: { host: "127.0.0.1:3100", "accept-language": "es" },
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://127.0.0.1:3100/es/playground",
    );
  });
  it("keeps Docker and reverse-proxy rewrites on the internal server origin", () => {
    for (const [origin, host] of [
      ["http://0.0.0.0:3000", "127.0.0.1:3001"],
      ["http://127.0.0.1:3000", "prelude.example"],
    ] as const) {
      const response = proxy(
        new NextRequest(`${origin}/playground?status=active`, {
          headers: {
            host,
            "x-forwarded-host": host,
            "x-forwarded-proto": "https",
            "accept-language": "es",
          },
        }),
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `${origin}/es/playground?status=active`,
      );
    }
  });
  it("removes explicit locale prefixes without exposing an internal address", () => {
    for (const [origin, host, publicOrigin] of [
      ["http://0.0.0.0:3000", "127.0.0.1:3001", "http://127.0.0.1:3001"],
      ["https://127.0.0.1:3000", "prelude.example", "https://prelude.example"],
    ] as const) {
      const response = proxy(
        new NextRequest(`${origin}/es/playground?status=active`, {
          headers: { host, cookie: "PRELUDE_LOCALE=es" },
        }),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${publicOrigin}/playground?status=active`);
    }
  });
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
