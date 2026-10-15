import { OpenAPIToolGenerator } from "mcp-from-openapi";

/**
 * The tool names MCP should list for an OpenAPI document, sorted. The browser suites compare a
 * live server with it. It runs the same generator as `generateMcpCatalog`, so `x-mcp` names
 * and opt-outs apply exactly as on the server; a unit test keeps the two in step.
 */
export async function expectedToolNames(document: object): Promise<string[]> {
  const generator = await OpenAPIToolGenerator.fromJSON(structuredClone(document), {
    secureDefaults: true,
  });
  const tools = await generator.generateTools({ includeDeprecated: true });
  return tools.map((tool) => tool.name).sort();
}
