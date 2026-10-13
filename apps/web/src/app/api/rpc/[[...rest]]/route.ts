import { onError } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { demoRepository, router } from "@repo/api";
import { logUnexpectedApiError } from "@/lib/api-errors";
import { plainRequest } from "@/lib/plain-request";

const handler = new RPCHandler(router, {
  plugins: [new BodyLimitPlugin({ maxBodySize: 64 * 1024 })],
  clientInterceptors: [onError(logUnexpectedApiError("rpc"))],
});

async function handle(request: Request) {
  const { response } = await handler.handle(plainRequest(request), {
    prefix: "/api/rpc",
    context: { repository: demoRepository },
  });
  const result = response ?? new Response("Not found", { status: 404 });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

export { handle as GET, handle as POST, handle as HEAD };
