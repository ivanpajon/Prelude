import { describe, expect, it } from "vitest";
import { makeQueryClient } from "./query-client";

describe("server query clients", () => {
  it("isolates request caches and keeps hydrated results fresh", () => {
    const first = makeQueryClient();
    const second = makeQueryClient();
    first.setQueryData(["private"], "first request");
    expect(second.getQueryData(["private"])).toBeUndefined();
    expect(first.getDefaultOptions().queries?.staleTime).toBe(60_000);
    first.clear();
    second.clear();
  });
});
