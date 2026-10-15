import { handleOpenApiRequest } from "@/lib/openapi";
import { createRequestContext } from "@/lib/request-context";

function handle(request: Request) {
  return handleOpenApiRequest(request, createRequestContext());
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
