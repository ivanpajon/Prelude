import "server-only";

import { redirect as nextRedirect } from "next/navigation";
import { createNavigation } from "next-intl/navigation";
import { type RoutingMode, routingByMode } from "./routing";

const navigation = {
  always: createNavigation(routingByMode.always),
  never: createNavigation(routingByMode.never),
};

// Server callers already know the root parameters; no request preferences are read.
export function getPathname(
  mode: RoutingMode,
  args: Parameters<typeof navigation.always.getPathname>[0],
) {
  return navigation[mode].getPathname(args);
}

export function redirect(
  mode: RoutingMode,
  args: Parameters<typeof navigation.always.getPathname>[0],
  type?: Parameters<typeof nextRedirect>[1],
): never {
  // This helper only navigates; changing a language preference is a separate action.
  return nextRedirect(getPathname(mode, args), type);
}
