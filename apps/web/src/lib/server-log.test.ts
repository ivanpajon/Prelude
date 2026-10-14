import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerError } from "./server-log";

afterEach(() => vi.restoreAllMocks());

describe("server error log", () => {
  it("writes one JSON line to stderr with the error and context fields", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("Broken");
    logServerError("Request failed", error, { path: "/en", method: "GET", skipped: undefined });

    expect(logged).toHaveBeenCalledOnce();
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      level: "error",
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      message: "Request failed",
      path: "/en",
      method: "GET",
      error: { name: "TypeError", message: "Broken", stack: error.stack },
    });
  });

  it("describes thrown values that are not errors and can omit the stack", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logServerError("Odd failure", "plain value");
    logServerError("Known failure", new Error("Known"), {}, { stack: false });

    const [odd, known] = logged.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(odd.error).toEqual({ message: "plain value" });
    expect(known.error).toEqual({ name: "Error", message: "Known" });
  });

  it("includes the cause and validation issues, but not the invalid value", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invalid = Object.assign(new Error("Validation failed"), {
      name: "ValidationError",
      issues: [{ message: "must be a string", path: [0, { key: "text" }] }],
      data: { secret: "PRIVATE_VALUE" },
    });
    const output = new Error("Output validation failed", { cause: invalid });
    logServerError("Bad output", output, {}, { stack: false });

    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain("PRIVATE_VALUE");
    expect(JSON.parse(line).error).toEqual({
      name: "Error",
      message: "Output validation failed",
      cause: {
        name: "ValidationError",
        message: "Validation failed",
        issues: [{ message: "must be a string", path: ["0", "text"] }],
      },
    });
  });

  it("stops following causes after a few levels", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const looped = new Error("Looped");
    looped.cause = looped;
    logServerError("Loop", looped, {}, { stack: false });

    const error = JSON.parse(String(logged.mock.calls[0]?.[0])).error;
    expect(error.cause.cause.cause).toEqual({ name: "Error", message: "Looped" });
  });
});
