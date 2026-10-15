import { describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "./route";

const connection = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next/server", () => ({ connection }));

describe("health endpoint", () => {
  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
  ])("answers %s per request with an uncached ok status", async (_method, handle) => {
    connection.mockClear();
    const response = await handle();
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
