import "server-only";

import { type Context, ORPCError } from "@orpc/server";
import type { StandardHandlerOptions } from "@orpc/server/standard";
import { logServerError } from "./server-log";

type Transport = "rpc" | "rest";

/** Errors already logged by `logUnexpectedApiError`, so the handler does not log them twice. */
const logged = new WeakSet<object>();

/**
 * An oRPC `onError` callback for procedure calls. Expected client errors (4xx) stay quiet;
 * anything that becomes a 500 is logged once, while the response stays generic.
 */
export function logUnexpectedApiError(transport: Transport) {
  return (error: unknown, { path }: { path: readonly string[] }) => {
    if (error instanceof ORPCError && error.status < 500) return;
    if (typeof error === "object" && error !== null) logged.add(error);
    logServerError("Unexpected API error", error, { transport, procedure: path.join(".") });
  };
}

/**
 * Handler interceptors that log a 5xx raised outside a procedure call, such as while generating
 * the OpenAPI document or encoding a response. oRPC turns those errors into a 500 itself.
 * Put `interceptors` first so they also wrap the plugins' interceptors.
 */
export function logUnexpectedHandlerErrors<T extends Context>(
  transport: Transport,
): Required<Pick<StandardHandlerOptions<T>, "interceptors" | "rootInterceptors">> {
  const failures = new WeakMap<object, unknown>();
  return {
    interceptors: [
      async ({ request, next }) => {
        try {
          return await next();
        } catch (error) {
          failures.set(request, error);
          throw error;
        }
      },
    ],
    rootInterceptors: [
      async ({ request, next }) => {
        const result = await next();
        const error = failures.get(request);
        // oRPC may replace a procedure's contract-defined error after it was logged.
        const procedureError =
          (typeof error === "object" && error !== null && logged.has(error)) ||
          (error instanceof ORPCError && error.defined);
        if ((result.response?.status ?? 0) >= 500 && !procedureError) {
          logServerError("Unexpected API error", error, {
            transport,
            method: request.method,
            path: request.url.pathname,
          });
        }
        return result;
      },
    ],
  };
}
