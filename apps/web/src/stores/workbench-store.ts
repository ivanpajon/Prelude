import { createStore } from "zustand/vanilla";

export type WorkbenchState = {
  compact: boolean;
};

export type WorkbenchStore = WorkbenchState & {
  toggleCompact: () => void;
};

// Create one store per provider so server requests never share mutable UI state.
export function createWorkbenchStore(initial: WorkbenchState = { compact: false }) {
  return createStore<WorkbenchStore>()((set) => ({
    compact: initial.compact,
    toggleCompact: () => set((state) => ({ compact: !state.compact })),
  }));
}

export type WorkbenchStoreApi = ReturnType<typeof createWorkbenchStore>;
