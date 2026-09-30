import { describe, expect, it, vi } from "vitest";
import { createWorkbenchStore, getWorkbenchStore } from "./workbench-store";

describe("createWorkbenchStore", () => {
  it("keeps server drafts and synchronous action guards isolated", () => {
    const first = getWorkbenchStore();
    const second = getWorkbenchStore();
    first.getState().setDraft({
      title: "Private draft",
      editing: { id: "one", title: "Edit" },
      validationError: "invalidTitle",
    });
    expect(first.getState().begin("creating")).toBe(true);
    expect(first.getState().begin("creating")).toBe(false);
    expect(second.getState().title).toBe("");
    expect(second.getState().editing).toBeUndefined();
    expect(second.getState().validationError).toBeUndefined();
    expect(second.getState().creating).toBe(false);
    first.getState().finish("creating");
    expect(first.getState().begin("creating")).toBe(true);
    expect(first.getInitialState().title).toBe("");
  });
  it("creates independent stores without sharing state or subscriptions", () => {
    const initial = { compact: true };
    const first = createWorkbenchStore(initial);
    const second = createWorkbenchStore(initial);
    const secondSubscriber = vi.fn();
    const unsubscribe = second.subscribe(secondSubscriber);

    first.getState().toggleCompact();

    expect(first.getState().compact).toBe(false);
    expect(second.getState().compact).toBe(true);
    expect(secondSubscriber).not.toHaveBeenCalled();
    expect(initial.compact).toBe(true);
    expect(first.getInitialState().compact).toBe(true);
    unsubscribe();
  });

  it("starts new stores with the same deterministic default", () => {
    const first = createWorkbenchStore();
    first.getState().toggleCompact();
    const next = createWorkbenchStore();

    expect(first.getState().compact).toBe(true);
    expect(first.getInitialState().compact).toBe(false);
    expect(next.getState().compact).toBe(false);
    expect(next.getInitialState().compact).toBe(false);
  });

  it.each([false, true])(
    "preserves the %s seed for server and browser initialization",
    (compact) => {
      const server = createWorkbenchStore({ compact });
      const browser = createWorkbenchStore({ compact });

      expect(server.getInitialState().compact).toBe(compact);
      expect(browser.getInitialState().compact).toBe(server.getInitialState().compact);
      expect(server.getState()).not.toBe(browser.getState());
    },
  );
});
