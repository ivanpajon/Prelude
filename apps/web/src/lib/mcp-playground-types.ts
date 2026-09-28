/** Plain JSON sent to the playground; MCP dependencies stay on the server. */
export interface McpPlaygroundTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string | undefined;
    readOnlyHint?: boolean | undefined;
    destructiveHint?: boolean | undefined;
    idempotentHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
  };
}

export interface McpPlaygroundResult {
  isError?: boolean;
  content: Array<{ type: string; [key: string]: unknown }>;
  structuredContent?: unknown;
}

export type McpPlaygroundResponse<T> = ({ ok: true } & T) | { ok: false; error: string };

export type McpPlaygroundDiscovery = McpPlaygroundResponse<{ tools: McpPlaygroundTool[] }>;
export type McpPlaygroundExecution = McpPlaygroundResponse<{ result: McpPlaygroundResult }>;
