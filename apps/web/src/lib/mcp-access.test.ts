import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMcpRequest, type McpEnvironment } from "./mcp-access";
import { handleInspectorRequest } from "./mcp-inspector";

function request(headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://127.0.0.1:3000/api/mcp", {
    method,
    headers: { Host: "localhost:3000", ...headers },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("MCP request access", () => {
  it.each(["development", "production", "test"])("is enabled by default in %s", async (mode) => {
    const fetch = vi.fn(async () => new Response("tool response"));
    const result = await handleMcpRequest(request(), fetch, { NODE_ENV: mode });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).toBe("tool response");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("hides the endpoint before accessing the request body or catalog", async () => {
    const incoming = request({ Origin: "https://untrusted.example" });
    const read = vi.spyOn(incoming, "json");
    const fetch = vi.fn();
    const result = await handleMcpRequest(incoming, fetch, {
      NODE_ENV: "production",
      MCP_ENABLED: "false",
      MCP_ALLOWED_ORIGINS: "invalid configuration is not read when disabled",
    });
    expect(result.status).toBe(404);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("accepts native clients on a production deployment without hostname configuration", async () => {
    const fetch = vi.fn(async () => new Response());
    expect(
      (
        await handleMcpRequest(request({ Host: "prelude.example" }), fetch, {
          NODE_ENV: "production",
        })
      ).status,
    ).toBe(200);
  });

  it.each(["", "null", "not an origin", "https://untrusted.example"])(
    "rejects production Origin %j before dispatch",
    async (origin) => {
      const fetch = vi.fn();
      const result = await handleMcpRequest(request({ Origin: origin }), fetch, {
        NODE_ENV: "production",
      });
      expect(result.status).toBe(403);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("allows only configured exact origins, including scheme and port, without adding CORS", async () => {
    const fetch = vi.fn(async () => new Response());
    const environment = {
      NODE_ENV: "production",
      MCP_ALLOWED_ORIGINS: "https://prelude.example, http://127.0.0.1:7000",
    };
    for (const origin of ["https://prelude.example", "http://127.0.0.1:7000"]) {
      const result = await handleMcpRequest(request({ Origin: origin }), fetch, environment);
      expect(result.status).toBe(200);
      expect(result.headers.has("access-control-allow-origin")).toBe(false);
    }
    for (const origin of [
      "http://prelude.example",
      "https://prelude.example:7000",
      "http://127.0.0.1:7001",
    ]) {
      expect((await handleMcpRequest(request({ Origin: origin }), fetch, environment)).status).toBe(
        403,
      );
    }
  });

  it.each<McpEnvironment>([
    { MCP_ENABLED: "yes" },
    { MCP_ALLOWED_ORIGINS: "*" },
    { MCP_ALLOWED_ORIGINS: "https://*.example.com" },
    { MCP_ALLOWED_ORIGINS: "https://user:password@example.com" },
    { MCP_ALLOWED_ORIGINS: "https://example.com/path" },
  ])("reports invalid configuration without dispatching: %j", async (environment) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn();
    const result = await handleMcpRequest(request(), fetch, environment);
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
    expect(await result.text()).not.toContain("password");
  });

  it.each([
    { Host: "evil.example", "X-Forwarded-Host": "localhost:3000" },
    { Origin: "https://evil.example" },
    { Origin: "null" },
    { Origin: "" },
    { Origin: "http://localhost:3000/path" },
  ])("rejects nonlocal development headers: %j", async (headers) => {
    const fetch = vi.fn();
    const result = await handleMcpRequest(request(headers), fetch, { NODE_ENV: "development" });
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects missing Host even when Next's Request.url uses loopback", async () => {
    const incoming = request();
    incoming.headers.delete("host");
    const fetch = vi.fn();
    expect((await handleMcpRequest(incoming, fetch, { NODE_ENV: "development" })).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows loopback development browser origins", async () => {
    const result = await handleMcpRequest(
      request({ Origin: "http://localhost:3000" }),
      async () => new Response(),
      { NODE_ENV: "development" },
    );
    expect(result.status).toBe(200);
  });

  it("does not expose internal failures and preserves SDK response headers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = await handleMcpRequest(request(), async () => {
      throw new Error("private implementation detail");
    });
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain("private implementation detail");
    const success = await handleMcpRequest(
      request(),
      async () =>
        new Response("event: message\n\n", { headers: { "Content-Type": "text/event-stream" } }),
    );
    expect(success.headers.get("content-type")).toBe("text/event-stream");
  });
});

describe("local Inspector wrapper", () => {
  it("renders a full-page iframe at a fixed loopback origin without any token handoff", async () => {
    const response = handleInspectorRequest(request({}, "GET"), {
      NODE_ENV: "development",
      MCP_INSPECTOR_PORT: "6284",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const html = await response.text();
    expect(html).toContain('src="http://127.0.0.1:6284/"');
    expect(html).toContain('title="Prelude MCP Inspector"');
    expect(html).not.toMatch(/token|autoConnect/i);
  });

  it.each(["GET", "POST", "HEAD", "OPTIONS"])(
    "returns 404 for %s in production, independently of MCP",
    (method) => {
      for (const enabled of ["true", "false"]) {
        const response = handleInspectorRequest(request({}, method), {
          NODE_ENV: "production",
          MCP_ENABLED: enabled,
          MCP_INSPECTOR_PORT: "invalid",
        });
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    },
  );

  it("blocks nonlocal headers even if development was exposed through a proxy", () => {
    expect(
      handleInspectorRequest(request({ Host: "evil.example" }, "GET"), { NODE_ENV: "development" })
        .status,
    ).toBe(403);
  });

  it("restricts the local wrapper to GET/HEAD and validates its port", async () => {
    expect(handleInspectorRequest(request(), { NODE_ENV: "development" }).status).toBe(405);
    expect(
      await handleInspectorRequest(request({}, "HEAD"), { NODE_ENV: "development" }).text(),
    ).toBe("");
    for (const port of ["0", "65536", "6274/path", '6274" onload="alert(1)']) {
      expect(
        handleInspectorRequest(request({}, "GET"), {
          NODE_ENV: "development",
          MCP_INSPECTOR_PORT: port,
        }).status,
      ).toBe(500);
    }
  });
});
