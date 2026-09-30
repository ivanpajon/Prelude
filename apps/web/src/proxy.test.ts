import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleProxy } from "./i18n/proxy";
import { ROUTING_MODE_COOKIE } from "./i18n/routing";
import proxy, { config } from "./proxy";

function request(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

describe("locale proxy", () => {
  beforeEach(() => {
    // The installed Next.js adapter enables this flag for skipProxyUrlNormalize.
    vi.stubEnv("__NEXT_NO_MIDDLEWARE_URL_NORMALIZE", "1");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("negotiates an explicit language URL by default, preserving search parameters", () => {
    const response = proxy(
      request("/playground?status=active", { "accept-language": "es-ES,es;q=0.9,en;q=0.8" }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/es/playground?status=active");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("x-middleware-rewrite")).toBe(false);
  });

  it("rewrites canonical prefixed URLs without writing cookies or forcing private caching", () => {
    const response = proxy(
      request("/es/playground?status=active", {
        cookie: `PRELUDE_LOCALE=en; ${ROUTING_MODE_COOKIE}=never`,
        "accept-language": "en",
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/always/es/playground?status=active",
    );
    expect(response.headers.has("x-middleware-next")).toBe(false);
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe("es");
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-next-intl-locale");
    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("x-robots-tag")).toBe(false);
    expect(response.headers.get("link")).toContain('hreflang="en"');
    expect(response.headers.get("link")).toContain('hreflang="es"');
    expect(response.headers.get("link")).not.toMatch(/\/(always|never)\//);
  });

  it("uses the hidden-URL override with locale negotiation, private caching, and noindex", () => {
    const response = proxy(
      request("/playground?status=active", {
        cookie: `${ROUTING_MODE_COOKIE}=never; PRELUDE_LOCALE=invalid`,
        "accept-language": "es",
        "x-request-id": "kept-through-rewrite",
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/never/es/playground?status=active",
    );
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe("es");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe("kept-through-rewrite");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.has("link")).toBe(false);
    expect(response.cookies.get("PRELUDE_LOCALE")?.value).toBe("es");
  });

  it.each([undefined, "invalid", "NEVER", "../../never"])(
    "ignores an unsupported routing override (%s)",
    (override) => {
      const cookie = override ? `${ROUTING_MODE_COOKIE}=${override}` : "";
      const response = proxy(request("/", { cookie, "accept-language": "es" }));
      expect(response.headers.get("location")).toBe("http://localhost/es");
    },
  );

  it("prefers a saved language and falls back from an invalid language cookie", () => {
    for (const [localeCookie, expected] of [
      ["en", "en"],
      ["invalid", "es"],
    ]) {
      const response = proxy(
        request("/", {
          cookie: `PRELUDE_LOCALE=${localeCookie}; ${ROUTING_MODE_COOKIE}=never`,
          "accept-language": "es",
        }),
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `http://localhost/never/${expected}`,
      );
    }
  });

  it("keeps loopback IP and Docker rewrites on the incoming server origin", () => {
    for (const [origin, host] of [
      ["http://127.0.0.1:3100", "127.0.0.1:3100"],
      ["http://0.0.0.0:3000", "127.0.0.1:3001"],
      ["http://127.0.0.1:3000", "prelude.example"],
    ] as const) {
      for (const [pathname, cookie, expected] of [
        ["/es/playground", "", "/always/es/playground"],
        ["/playground", `${ROUTING_MODE_COOKIE}=never`, "/never/es/playground"],
      ] as const) {
        const response = proxy(
          new NextRequest(`${origin}${pathname}?status=active`, {
            headers: {
              host,
              cookie,
              "x-forwarded-host": host,
              "x-forwarded-proto": "https",
              "accept-language": "es",
            },
          }),
        );
        expect(response.headers.get("x-middleware-rewrite")).toBe(
          `${origin}${expected}?status=active`,
        );
      }
    }
  });

  it("uses fixed always mode when the demo is disabled, ignoring visitor overrides", () => {
    const fixed = createLocaleProxy({ defaultMode: "always", demoEnabled: false });
    const response = fixed(
      request("/playground", {
        cookie: `${ROUTING_MODE_COOKIE}=never; PRELUDE_LOCALE=es`,
      }),
    );
    expect(response.headers.get("location")).toBe("http://localhost/es/playground");
  });

  it("uses fixed never mode without demo noindex and removes incoming language prefixes", () => {
    const fixed = createLocaleProxy({ defaultMode: "never", demoEnabled: false });
    const headers = { cookie: `${ROUTING_MODE_COOKIE}=always; PRELUDE_LOCALE=es` };
    const page = fixed(request("/playground", headers));
    expect(page.headers.get("x-middleware-rewrite")).toBe("http://localhost/never/es/playground");
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(page.headers.has("x-robots-tag")).toBe(false);
    expect(page.headers.has("link")).toBe(false);
    const redirect = fixed(request("/es/playground?status=active", headers));
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("http://localhost/playground?status=active");
    expect(redirect.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps fixed-mode redirects on the server origin for Next.js to relativize", () => {
    const fixed = createLocaleProxy({ defaultMode: "never", demoEnabled: false });
    const response = fixed(
      new NextRequest("http://0.0.0.0:3000/es/playground?status=active", {
        headers: { host: "127.0.0.1:3001", cookie: "PRELUDE_LOCALE=es" },
      }),
    );
    expect(response.headers.get("location")).toBe("http://0.0.0.0:3000/playground?status=active");
  });

  it("supports never as the demo default and an explicit always override", () => {
    const hiddenDefault = createLocaleProxy({ defaultMode: "never", demoEnabled: true });
    const hidden = hiddenDefault(request("/", { "accept-language": "es" }));
    expect(hidden.headers.get("x-middleware-rewrite")).toBe("http://localhost/never/es");
    expect(hidden.headers.has("x-robots-tag")).toBe(false);
    const explicit = hiddenDefault(
      request("/", { cookie: `${ROUTING_MODE_COOKIE}=always`, "accept-language": "es" }),
    );
    expect(explicit.headers.get("location")).toBe("http://localhost/es");
    const sharedLink = hiddenDefault(request("/es"));
    expect(sharedLink.headers.get("x-middleware-rewrite")).toBe("http://localhost/always/es");
  });

  it.each(["/always/en", "/never/es/playground"])(
    "rejects direct internal routing paths (%s)",
    (pathname) => {
      const response = proxy(request(pathname));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.has("location")).toBe(false);
      expect(response.headers.has("x-middleware-rewrite")).toBe(false);
    },
  );

  it.each([
    "/api/docs",
    "/api/openapi.json",
    "/api/mcp/inspector",
    "/offline",
    "/_next/static/chunk.js",
    "/manifest.webmanifest",
    "/sw.js",
  ])("excludes unlocalized endpoints and assets (%s)", (pathname) => {
    expect(unstable_doesMiddlewareMatch({ config, url: `http://localhost${pathname}` })).toBe(
      false,
    );
  });

  it("does not share routing or language selection across requests", () => {
    const spanishHidden = proxy(
      request("/", { cookie: `${ROUTING_MODE_COOKIE}=never; PRELUDE_LOCALE=es` }),
    );
    const englishDefault = proxy(request("/", { "accept-language": "en" }));
    const englishCanonical = proxy(request("/en", { cookie: "PRELUDE_LOCALE=es" }));
    expect(spanishHidden.headers.get("x-middleware-rewrite")).toBe("http://localhost/never/es");
    expect(englishDefault.headers.get("location")).toBe("http://localhost/en");
    expect(englishCanonical.headers.get("x-middleware-rewrite")).toBe("http://localhost/always/en");
  });

  it("marks server action requests private even on explicit language URLs", () => {
    const response = proxy(new NextRequest("http://localhost/en", { method: "POST" }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
