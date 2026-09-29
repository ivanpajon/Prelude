import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleLocale = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = handleLocale(request);
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite) {
    // NextURL normalizes loopback IPs to localhost. Restore the request host so
    // Next.js keeps this rewrite internal rather than proxying another origin.
    const destination = new URL(rewrite);
    destination.host = request.headers.get("host") ?? destination.host;
    response.headers.set("x-middleware-rewrite", destination.toString());
  }
  // Public URLs vary by language cookie/header; cache only inside Next.js by locale.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|offline(?:/|$)|.*\\..*).*)"],
};
