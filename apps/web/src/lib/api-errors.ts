import "server-only";

import { ORPCError } from "@orpc/server";
import { logServerError } from "./server-log";

/**
 * An oRPC `onError` callback for procedure calls. Expected client errors (4xx) stay quiet;
 * anything that becomes a 500 is logged once, while the response stays generic.
 */
export function logUnexpectedApiError(transport: "rpc" | "rest") {
  return (error: unknown, { path }: { path: readonly string[] }) => {
    if (error instanceof ORPCError && error.status < 500) return;
    logServerError("Unexpected API error", error, { transport, procedure: path.join(".") });
  };
}
