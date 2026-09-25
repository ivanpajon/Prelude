"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";
import {
  createWorkbenchStore,
  type WorkbenchState,
  type WorkbenchStore,
  type WorkbenchStoreApi,
} from "@/stores/workbench-store";

const WorkbenchStoreContext = createContext<WorkbenchStoreApi | null>(null);

export function WorkbenchStoreProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: WorkbenchState;
}) {
  const [store] = useState(() => createWorkbenchStore(initial));

  return <WorkbenchStoreContext.Provider value={store}>{children}</WorkbenchStoreContext.Provider>;
}

export function useWorkbenchStore<T>(selector: (state: WorkbenchStore) => T): T {
  const store = useContext(WorkbenchStoreContext);

  if (!store) {
    throw new Error("useWorkbenchStore must be used within a WorkbenchStoreProvider");
  }

  return useStore(store, selector);
}
