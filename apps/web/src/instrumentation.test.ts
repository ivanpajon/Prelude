import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const context = {
  routerKind: "App Router",
  routePath: "/[routingMode]/[locale]/playground",
  routeType: "render",
  renderSource: "server-rendering",
  revalidateReason: undefined,
  renderType: "dynamic",
} as const;

describe("instrumentation", () => {
  it("stops a Node.js server that starts with an invalid environment", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("MCP_ENABLED", "true");
    await register();
    expect(exit).not.toHaveBeenCalled();

    vi.stubEnv("MCP_ENABLED", "yes");
    await register();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("MCP_ENABLED must be true or false."),
    );

    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("logs request errors with the digest and route but without query or stack", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("Render failed"), { digest: "1234567890" });
    await onRequestError(
      error,
      { path: "/en/playground?token=secret", method: "GET", headers: {} },
      context,
    );

    expect(logged).toHaveBeenCalledOnce();
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain("secret");
    expect(JSON.parse(line)).toEqual({
      level: "error",
      time: expect.any(String),
      message: "Request failed",
      digest: "1234567890",
      method: "GET",
      path: "/en/playground",
      route: "/[routingMode]/[locale]/playground",
      routeType: "render",
      error: { name: "Error", message: "Render failed" },
    });
  });
});
