import { RPCHandler } from "@orpc/server/fetch";
import { demoRepository, router } from "@repo/api";

const handler = new RPCHandler(router);

async function handle(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { repository: demoRepository },
  });
  const result = response ?? new Response("Not found", { status: 404 });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

export { handle as GET, handle as POST, handle as HEAD };
