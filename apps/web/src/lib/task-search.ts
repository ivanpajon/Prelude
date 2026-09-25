import { taskStatuses } from "@repo/contracts";
import { createLoader, parseAsStringLiteral } from "nuqs/server";

export const taskSearchParsers = {
  status: parseAsStringLiteral(taskStatuses).withDefault("all"),
};

export const loadTaskSearch = createLoader(taskSearchParsers);
