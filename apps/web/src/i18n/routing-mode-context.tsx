"use client";

import { createContext, useContext } from "react";
import type { RoutingMode } from "./routing";

export const RoutingModeContext = createContext<RoutingMode | null>(null);

export function useRoutingMode() {
  const mode = useContext(RoutingModeContext);
  if (!mode) throw new Error("Localized navigation requires RoutingPreferenceProvider");
  return mode;
}
