import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { checkMain } from "./mcp-check.mjs";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("./dev-web.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  loadDevEnvironment: vi.fn(() => ({ PORT: "3100" })),
}));

describe("MCP check", () => {
  it("defaults to the port from the development environment files", () => {
    expect(checkMain([])).toBe(0);
    expect(spawnSync.mock.calls[0][1]).toContain("http://127.0.0.1:3100/api/mcp");
  });
});
