import "server-only";

import { type AnyRouter, type InferRouterInitialContext, onError } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { logUnexpectedApiError } from "./api-errors";
import { plainRequest } from "./plain-request";

/** Creates the `/api/rpc` adapter that the website's typed client calls. */
export function createRpc<TRouter extends AnyRouter>(apiRouter: TRouter) {
  const handler = new RPCHandler(apiRouter, {
    plugins: [new BodyLimitPlugin({ maxBodySize: 64 * 1024 })],
    clientInterceptors: [onError(logUnexpectedApiError("rpc"))],
  });

  return async function handle(
    request: Request,
    context: InferRouterInitialContext<TRouter>,
  ): Promise<Response> {
    const { response } = await handler.handle(plainRequest(request), {
      prefix: "/api/rpc",
      context,
    });
    const result = response ?? new Response("Not found", { status: 404 });
    result.headers.set("Cache-Control", "no-store");
    return result;
  };
}
