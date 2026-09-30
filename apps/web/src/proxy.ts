import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleLocale = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = handleLocale(request);
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite) {
    // With skipProxyUrlNormalize, request.url retains Next.js's original server
    // origin. Keep it: a public Host can use a different port behind Docker or
    // a reverse proxy, and NextURL also normalizes loopback IPs to localhost.
    const destination = new URL(rewrite);
    const original = new URL(request.url);
    destination.protocol = original.protocol;
    destination.hostname = original.hostname;
    destination.port = original.port;
    response.headers.set("x-middleware-rewrite", destination.toString());
  }
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    // Prefix removal is a browser redirect, so retain the public Host rather
    // than exposing the container's listening address. Routing has no domains.
    const destination = new URL(location, request.url);
    const original = new URL(request.url);
    const publicOrigin = new URL(
      `${original.protocol}//${request.headers.get("host") ?? original.host}`,
    );
    destination.hostname = publicOrigin.hostname;
    destination.port = publicOrigin.port;
    response.headers.set("location", destination.toString());
  }
  // Public URLs vary by language cookie/header; cache only inside Next.js by locale.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|offline(?:/|$)|.*\\..*).*)"],
};
