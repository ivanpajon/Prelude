"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";
import {
  getWorkbenchStore,
  type WorkbenchStore,
  type WorkbenchStoreApi,
} from "@/stores/workbench-store";

const WorkbenchStoreContext = createContext<WorkbenchStoreApi | null>(null);

export function WorkbenchStoreProvider({
  children,
  store: injectedStore,
}: {
  children: ReactNode;
  store?: WorkbenchStoreApi;
}) {
  const [store] = useState(() => injectedStore ?? getWorkbenchStore());

  return <WorkbenchStoreContext.Provider value={store}>{children}</WorkbenchStoreContext.Provider>;
}

export function useWorkbenchStore<T>(selector: (state: WorkbenchStore) => T): T {
  return useStore(useWorkbenchStoreApi(), selector);
}

export function useWorkbenchStoreApi() {
  const store = useContext(WorkbenchStoreContext);

  if (!store) {
    throw new Error("useWorkbenchStore must be used within a WorkbenchStoreProvider");
  }

  return store;
}
