import { router } from "@repo/api";
import { createRequestContext } from "@/lib/request-context";
import { createRpc } from "@/lib/rpc";

const handleRpcRequest = createRpc(router);

function handle(request: Request) {
  return handleRpcRequest(request, createRequestContext());
}

export { handle as GET, handle as POST, handle as HEAD };
