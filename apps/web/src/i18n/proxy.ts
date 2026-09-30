import { isLocale } from "@repo/i18n";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import {
  isRoutingMode,
  ROUTING_MODE_COOKIE,
  type RoutingMode,
  type RoutingSettings,
  routingByMode,
  routingSettings,
} from "./routing";

const handleLocale = {
  always: createMiddleware(routingByMode.always),
  never: createMiddleware(routingByMode.never),
};
// Public language URLs are deterministic and must not write visitor preferences.
const handleCanonicalLocale = createMiddleware({
  ...routingByMode.always,
  localeCookie: false,
});

export function createLocaleProxy(settings: RoutingSettings = routingSettings) {
  return (request: NextRequest) => {
    const url = new URL(request.url);
    const firstSegment = url.pathname.split("/")[1];

    // These root parameters identify static variants, never public routes.
    if (isRoutingMode(firstSegment)) {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const hasLocalePrefix = isLocale(firstSegment);
    const override = request.cookies.get(ROUTING_MODE_COOKIE)?.value;
    let mode: RoutingMode = settings.defaultMode;
    if (settings.demoEnabled) {
      if (hasLocalePrefix) mode = "always";
      else if (isRoutingMode(override)) mode = override;
    }

    let response =
      mode === "always" && hasLocalePrefix
        ? handleCanonicalLocale(request)
        : handleLocale[mode](request);

    if (response.ok) {
      // next-intl may return next() for a canonical URL or rewrite a negotiated
      // locale. Compose either result without changing the original origin.
      const destination = new URL(response.headers.get("x-middleware-rewrite") ?? request.url);
      destination.pathname = `/${mode}${destination.pathname}`;
      response.headers.delete("x-middleware-next");
      response = NextResponse.rewrite(destination, { headers: response.headers });
    }

    if (!hasLocalePrefix || mode === "never" || !response.ok || request.method !== "GET") {
      response.headers.set("Cache-Control", "private, no-store");
    }
    if (settings.demoEnabled && mode === "never" && mode !== settings.defaultMode) {
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return response;
  };
}
