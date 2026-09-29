import { demoRepository } from "@repo/api";
import { handleOpenApiRequest } from "@/lib/openapi";

function handle(request: Request) {
  return handleOpenApiRequest(request, { repository: demoRepository });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
