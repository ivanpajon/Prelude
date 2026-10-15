import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { INTERNAL_ERROR, type McpServer, ProtocolError } from "@modelcontextprotocol/server";
import type { McpOpenAPITool } from "mcp-from-openapi";
import type { TaskAppTools } from "@/mcp-apps/tasks/model";
import type { McpToolCallback, McpToolConfig } from "./mcp";

export const mcpAppResourceUri = "ui://prelude/tasks.html";
const configPlaceholder = "<!--PRELUDE_MCP_APP_CONFIG-->";

export type McpAppHtmlLoader = () => string | Promise<string>;

/** Resolve the final generated names after x-mcp renames and exclusions. */
export function getTaskAppTools(catalog: readonly McpOpenAPITool[]): TaskAppTools | undefined {
  const nameFor = (operationId: string) =>
    catalog.find((tool) => tool.metadata.operationId === operationId)?.name;
  const listTasks = nameFor("listTasks");
  if (!listTasks) return undefined;
  const createTask = nameFor("createTask");
  const setTaskCompleted = nameFor("setTaskCompleted");
  const updateTaskTitle = nameFor("updateTaskTitle");
  const deleteTask = nameFor("deleteTask");
  return {
    listTasks,
    ...(createTask === undefined ? {} : { createTask }),
    ...(setTaskCompleted === undefined ? {} : { setTaskCompleted }),
    ...(updateTaskTitle === undefined ? {} : { updateTaskTitle }),
    ...(deleteTask === undefined ? {} : { deleteTask }),
  };
}

/** The production process shares only a successful asset read; development reads each rebuild. */
export function createMcpAppHtmlLoader({
  cache = process.env.NODE_ENV === "production",
  read = () => readFile(path.join(process.cwd(), ".generated/mcp-apps/tasks.html"), "utf8"),
}: {
  cache?: boolean;
  read?: McpAppHtmlLoader;
} = {}): McpAppHtmlLoader {
  let cached: Promise<string> | undefined;
  return () => {
    if (!cache) return read();
    cached ??= Promise.resolve()
      .then(read)
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };
}

export function injectMcpAppConfig(html: string, tools: TaskAppTools): string {
  const position = html.indexOf(configPlaceholder);
  if (position === -1 || position !== html.lastIndexOf(configPlaceholder)) {
    throw new Error("The MCP App asset must contain exactly one configuration placeholder.");
  }
  // Prevent a generated name from ending the non-executable JSON script element.
  const config = JSON.stringify({ tools }).replaceAll("<", "\\u003c");
  return html.replace(
    configPlaceholder,
    () => `<script type="application/json" id="prelude-mcp-app-config">${config}</script>`,
  );
}

export function registerTaskAppResource(
  server: McpServer,
  tools: TaskAppTools,
  getAppHtml: McpAppHtmlLoader,
): void {
  const meta = {
    ui: {
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
    },
  };
  registerAppResource(
    server,
    "Prelude task workspace",
    mcpAppResourceUri,
    { description: "Create, edit, filter, complete, and delete tasks in an MCP App.", _meta: meta },
    async () => {
      try {
        return {
          contents: [
            {
              uri: mcpAppResourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: injectMcpAppConfig(await getAppHtml(), tools),
              _meta: meta,
            },
          ],
        };
      } catch {
        // Missing build artifacts and filesystem errors must not reveal server paths.
        throw new ProtocolError(
          INTERNAL_ERROR,
          "The MCP App is unavailable. Rebuild the application and try again.",
        );
      }
    },
  );
}

/**
 * Registers the task MCP App when the catalog includes `listTasks`. The returned function
 * registers `listTasks` as the App's tool and returns false for every other tool.
 */
export function registerTaskApp(
  server: McpServer,
  catalog: readonly McpOpenAPITool[],
  getAppHtml: McpAppHtmlLoader,
) {
  const tools = getTaskAppTools(catalog);
  if (!tools) return undefined;
  registerTaskAppResource(server, tools, getAppHtml);
  return (tool: McpOpenAPITool, config: McpToolConfig, execute: McpToolCallback) => {
    if (tool.metadata.operationId !== "listTasks") return false;
    const existingUi = tool._meta?.ui;
    registerAppTool(
      server,
      tool.name,
      {
        ...config,
        _meta: {
          ...tool._meta,
          [RESOURCE_URI_META_KEY]: mcpAppResourceUri,
          ui: {
            ...(existingUi !== null && typeof existingUi === "object" ? existingUi : {}),
            resourceUri: mcpAppResourceUri,
          },
        },
      },
      execute,
    );
    return true;
  };
}
