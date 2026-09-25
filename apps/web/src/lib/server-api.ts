import "server-only";

import { createApiClient, demoRepository } from "@repo/api";
import { cache } from "react";
import { makeQueryClient } from "./query-client";

// React.cache scopes this instance to the current Server Component request.
export const getServerQueryClient = cache(makeQueryClient);

export function getServerApiClient() {
  return createApiClient({ repository: demoRepository });
}
