import type { McpOpenAPITool } from "mcp-from-openapi";
import { describe, expect, it, vi } from "vitest";
import { createMcpAppHtmlLoader, getTaskAppTools, injectMcpAppConfig } from "./mcp-app-resource";

const html = "<!doctype html><html><head><!--PRELUDE_MCP_APP_CONFIG--></head><body></body></html>";

function tool(operationId: string, name = operationId): McpOpenAPITool {
  return {
    name,
    description: operationId,
    inputSchema: { type: "object" },
    mapper: [],
    metadata: { operationId, method: "get", path: "/tasks" },
  };
}

describe("MCP App tool configuration", () => {
  it("maps deletion by operation ID after a tool rename", () => {
    expect(
      getTaskAppTools([tool("listTasks", "read_tasks"), tool("deleteTask", "remove_task")]),
    ).toEqual({ listTasks: "read_tasks", deleteTask: "remove_task" });
  });

  it("omits deletion when excluded without treating an unrelated tool name as the operation", () => {
    const config = getTaskAppTools([
      tool("listTasks"),
      tool("createTask"),
      tool("unrelatedOperation", "deleteTask"),
    ]);
    expect(config).toEqual({ listTasks: "listTasks", createTask: "createTask" });
    expect(injectMcpAppConfig(html, config ?? { listTasks: "invalid" })).not.toContain(
      '"deleteTask"',
    );
    expect(getTaskAppTools([tool("deleteTask")])).toBeUndefined();
  });
});

describe("MCP App HTML", () => {
  it("injects exact tool names without permitting HTML or replacement-string injection", () => {
    const tools = {
      listTasks: 'list</script><script>alert("unsafe")</script>$&',
      createTask: "create-renamed",
      deleteTask: "delete-renamed",
    };
    const output = injectMcpAppConfig(html, tools);
    const match = output.match(
      /<script type="application\/json" id="prelude-mcp-app-config">([^<]*)<\/script>/,
    );
    expect(match?.[1]).toBeDefined();
    expect(JSON.parse(match?.[1] ?? "null")).toEqual({ tools });
    expect(output.match(/<script/g)).toHaveLength(1);
    expect(output).not.toContain("<!--PRELUDE_MCP_APP_CONFIG-->");
    expect(output).toContain("\\u003c/script>");
  });

  it("rejects missing or ambiguous build placeholders", () => {
    const tools = { listTasks: "listTasks" };
    expect(() => injectMcpAppConfig("<html></html>", tools)).toThrow("exactly one");
    expect(() => injectMcpAppConfig(`${html}<!--PRELUDE_MCP_APP_CONFIG-->`, tools)).toThrow(
      "exactly one",
    );
  });

  it("loads lazily and shares successful concurrent reads when caching is enabled", async () => {
    const read = vi.fn(async () => html);
    const getAppHtml = createMcpAppHtmlLoader({ cache: true, read });
    expect(read).not.toHaveBeenCalled();
    await expect(Promise.all([getAppHtml(), getAppHtml()])).resolves.toEqual([html, html]);
    expect(await getAppHtml()).toBe(html);
    expect(read).toHaveBeenCalledOnce();
  });

  it("retries failed reads and caches the recovered asset", async () => {
    const read = vi.fn(async () => html).mockRejectedValueOnce(new Error("Not built yet"));
    const getAppHtml = createMcpAppHtmlLoader({ cache: true, read });
    await expect(getAppHtml()).rejects.toThrow("Not built yet");
    await expect(getAppHtml()).resolves.toBe(html);
    await expect(getAppHtml()).resolves.toBe(html);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads a rebuilt asset each time when caching is disabled", async () => {
    const read = vi.fn(async () => html).mockResolvedValueOnce("first build");
    const getAppHtml = createMcpAppHtmlLoader({ cache: false, read });
    await expect(getAppHtml()).resolves.toBe("first build");
    await expect(getAppHtml()).resolves.toBe(html);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
