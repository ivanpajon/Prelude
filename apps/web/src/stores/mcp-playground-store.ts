import { createStore } from "zustand/vanilla";
import type { McpPlaygroundErrorCode } from "../lib/mcp-playground-types";

type PlaygroundDraft = {
  selectedName: string;
  drafts: Record<string, string>;
  inputError: McpPlaygroundErrorCode | undefined;
  executionVisible: boolean;
};

export type McpPlaygroundStore = PlaygroundDraft & {
  running: boolean;
  setDraft: (draft: Partial<PlaygroundDraft>) => void;
  setArguments: (name: string, value: string) => void;
  begin: () => boolean;
  finish: () => void;
};

export function createMcpPlaygroundStore() {
  return createStore<McpPlaygroundStore>()((set, get) => ({
    selectedName: "",
    drafts: {},
    inputError: undefined,
    executionVisible: false,
    running: false,
    setDraft: (draft) => set(draft),
    setArguments: (name, value) => set((state) => ({ drafts: { ...state.drafts, [name]: value } })),
    begin: () => {
      if (get().running) return false;
      set({ running: true, executionVisible: true });
      return true;
    },
    finish: () => set({ running: false }),
  }));
}

export type McpPlaygroundStoreApi = ReturnType<typeof createMcpPlaygroundStore>;

let browserStore: McpPlaygroundStoreApi | undefined;

/** A browser tab keeps drafts across locale remounts; SSR always uses fresh state. */
export function getMcpPlaygroundStore() {
  if (typeof window === "undefined") return createMcpPlaygroundStore();
  browserStore ??= createMcpPlaygroundStore();
  return browserStore;
}
