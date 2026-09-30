import { expect, it } from "vitest";
import { getMcpPlaygroundStore } from "./mcp-playground-store";

it("isolates server tool drafts and execution guards with deterministic initial state", () => {
  const first = getMcpPlaygroundStore();
  const second = getMcpPlaygroundStore();
  first.getState().setDraft({ selectedName: "createTask", inputError: "errorInvalidJson" });
  first.getState().setArguments("createTask", '{"title":"Private draft"}');
  expect(first.getState().begin()).toBe(true);
  expect(first.getState().begin()).toBe(false);
  expect(second.getState().selectedName).toBe("");
  expect(second.getState().drafts).toEqual({});
  expect(second.getState().inputError).toBeUndefined();
  expect(second.getState().running).toBe(false);
  first.getState().finish();
  expect(first.getState().begin()).toBe(true);
  expect(first.getInitialState().drafts).toEqual({});
});
