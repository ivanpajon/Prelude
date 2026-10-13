import type { Instrumentation } from "next";
import { parseServerEnvironment } from "./env";
import { logServerError } from "./lib/server-log";

// Connect Sentry, OpenTelemetry or another reporting service here: start it in register()
// and forward errors from onRequestError().

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    parseServerEnvironment();
  } catch (error) {
    // Next.js would keep running and answer every request with 500. Stop with a clear
    // message instead, so the process manager or container shows the failed start.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  // Next.js prints the stack itself; this line adds the digest shown to visitors and the route.
  logServerError(
    "Request failed",
    error,
    {
      digest,
      method: request.method,
      // Drop the query string: it can carry tokens or personal data.
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    },
    { stack: false },
  );
};
