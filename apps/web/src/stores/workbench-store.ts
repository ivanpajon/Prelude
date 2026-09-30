import { createStore } from "zustand/vanilla";

export type WorkbenchState = {
  compact: boolean;
};

export type TaskErrorCode =
  | "invalidTitle"
  | "taskNotFound"
  | "createFailed"
  | "completionFailed"
  | "deleteFailed"
  | "editFailed";

type WorkbenchDraft = {
  title: string;
  validationError: TaskErrorCode | undefined;
  editing: { id: string; title: string } | undefined;
  editError: TaskErrorCode | undefined;
};

export type WorkbenchStore = WorkbenchState &
  WorkbenchDraft & {
    creating: boolean;
    changing: boolean;
    toggleCompact: () => void;
    setDraft: (draft: Partial<WorkbenchDraft>) => void;
    begin: (operation: "creating" | "changing") => boolean;
    finish: (operation: "creating" | "changing") => void;
  };

// Server rendering and isolated providers create fresh, deterministic state.
export function createWorkbenchStore(initial: WorkbenchState = { compact: false }) {
  return createStore<WorkbenchStore>()((set, get) => ({
    compact: initial.compact,
    title: "",
    validationError: undefined,
    editing: undefined,
    editError: undefined,
    creating: false,
    changing: false,
    toggleCompact: () => set((state) => ({ compact: !state.compact })),
    setDraft: (draft) => set(draft),
    begin: (operation) => {
      if (get()[operation]) return false;
      set({ [operation]: true });
      return true;
    },
    finish: (operation) => set({ [operation]: false }),
  }));
}

export type WorkbenchStoreApi = ReturnType<typeof createWorkbenchStore>;

let browserStore: WorkbenchStoreApi | undefined;

/** Retain tab-local state across locale route remounts; never share server state. */
export function getWorkbenchStore(initial?: WorkbenchState): WorkbenchStoreApi {
  if (typeof window === "undefined") return createWorkbenchStore(initial);
  browserStore ??= createWorkbenchStore(initial);
  return browserStore;
}
