"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ApiClient } from "@repo/contracts";

const client: ApiClient = createORPCClient(
  new RPCLink({ url: () => `${window.location.origin}/api/rpc` }),
);

export const orpc = createTanstackQueryUtils(client);
