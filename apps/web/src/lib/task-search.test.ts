import { describe, expect, it } from "vitest";
import { loadTaskSearch } from "./task-search";

describe("task URL state", () => {
  it("parses valid filters and defaults malformed values", () => {
    expect(loadTaskSearch({ status: "completed" })).toEqual({ status: "completed" });
    expect(loadTaskSearch({ status: "invalid" })).toEqual({ status: "all" });
    expect(loadTaskSearch({})).toEqual({ status: "all" });
  });
});
