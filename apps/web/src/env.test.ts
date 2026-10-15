import { describe, expect, it } from "vitest";
import { parseOrigin, parseServerEnvironment } from "./env";

describe("server environment", () => {
  it("uses safe defaults when nothing is set", () => {
    expect(parseServerEnvironment({})).toEqual({
      development: false,
      mcpEnabled: true,
      mcpAllowedOrigins: [],
      mcpInspectorPort: 6274,
    });
  });

  it("returns typed values for valid settings", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "development",
        MCP_ENABLED: " TRUE ",
        MCP_ALLOWED_ORIGINS: "https://app.example.com, http://127.0.0.1:7000/",
        MCP_INSPECTOR_PORT: "6284",
      }),
    ).toEqual({
      development: true,
      mcpEnabled: true,
      mcpAllowedOrigins: ["https://app.example.com", "http://127.0.0.1:7000"],
      mcpInspectorPort: 6284,
    });
    expect(parseServerEnvironment({ MCP_ENABLED: "false" }).mcpEnabled).toBe(false);
    expect(parseServerEnvironment({ MCP_ALLOWED_ORIGINS: "  " }).mcpAllowedOrigins).toEqual([]);
  });

  it.each([
    [{ MCP_ENABLED: "yes" }, "MCP_ENABLED must be true or false."],
    [{ MCP_ENABLED: "" }, "MCP_ENABLED must be true or false."],
    [{ MCP_ALLOWED_ORIGINS: "*" }, "MCP_ALLOWED_ORIGINS must be a comma-separated list"],
    [{ MCP_ALLOWED_ORIGINS: "https://ok.example,https://*.example" }, "MCP_ALLOWED_ORIGINS"],
    [{ NODE_ENV: "development", MCP_INSPECTOR_PORT: "0" }, "MCP_INSPECTOR_PORT must be"],
    [{ NODE_ENV: "development", MCP_INSPECTOR_PORT: "6274/x" }, "MCP_INSPECTOR_PORT must be"],
  ])("rejects %j with a message that names the variable", (environment, message) => {
    expect(() => parseServerEnvironment(environment)).toThrow(message);
  });

  it("names every invalid variable in one error without echoing the values", () => {
    let message = "";
    try {
      parseServerEnvironment({
        NODE_ENV: "development",
        MCP_ENABLED: "maybe",
        MCP_ALLOWED_ORIGINS: "https://user:password@example.com",
        MCP_INSPECTOR_PORT: "65536",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Invalid environment variables:/);
    for (const name of ["MCP_ENABLED", "MCP_ALLOWED_ORIGINS", "MCP_INSPECTOR_PORT"]) {
      expect(message).toContain(name);
    }
    expect(message).not.toContain("password");
  });

  it("ignores settings that have no effect", () => {
    expect(
      parseServerEnvironment({ MCP_ENABLED: "false", MCP_ALLOWED_ORIGINS: "not an origin" }),
    ).toMatchObject({ mcpEnabled: false, mcpAllowedOrigins: [] });
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "production", MCP_INSPECTOR_PORT: "invalid" }),
    ).not.toThrow();
  });

  it.each(["", "null", "ftp://example.com", "https://example.com/path", "https://a.example?x"])(
    "rejects origin %j",
    (value) => expect(parseOrigin(value)).toBeUndefined(),
  );
});
