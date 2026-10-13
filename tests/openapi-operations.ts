const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

type Extensible = { "x-mcp"?: unknown };
type OpenApiDocument = Extensible & {
  paths?: Record<string, Extensible & Record<string, unknown>>;
};

/**
 * The tool names that MCP should generate from an OpenAPI document: every operation ID, sorted,
 * except operations hidden with `"x-mcp": false` at the root, path, or operation level.
 */
export function expectedToolNames(document: OpenApiDocument): string[] {
  const names: string[] = [];
  for (const item of Object.values(document.paths ?? {})) {
    for (const method of methods) {
      const operation = item[method] as (Extensible & { operationId?: unknown }) | undefined;
      if (!operation || typeof operation.operationId !== "string") continue;
      const enabled = operation["x-mcp"] ?? item["x-mcp"] ?? document["x-mcp"];
      if (enabled !== false) names.push(operation.operationId);
    }
  }
  return names.sort();
}
