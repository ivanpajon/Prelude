import type { ContractRouterClient } from "@orpc/contract";
// demo:start

import { tasksContract } from "./tasks";

export * from "./tasks";

// demo:end

export const contract = {
  // Add each feature's contract here.
  // demo:start
  tasks: tasksContract,
  // demo:end
};

export type ApiClient = ContractRouterClient<typeof contract>;
