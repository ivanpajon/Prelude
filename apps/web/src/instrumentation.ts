import type { Instrumentation } from "next";
import { logServerError } from "./lib/server-log";

// Connect Sentry, OpenTelemetry or another reporting service here: start it in register()
// and forward errors from onRequestError().

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvironmentOrExit } = await import("./instrumentation-node");
    validateEnvironmentOrExit();
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
