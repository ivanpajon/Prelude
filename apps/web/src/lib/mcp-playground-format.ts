import type { McpPlaygroundResult } from "./mcp-playground-types";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Starter values are editable suggestions, never a substitute for server validation.
function example(schema: unknown, depth = 0): unknown {
  if (!record(schema) || depth > 8) return null;
  if ("default" in schema) return schema.default;
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(alternatives)) return example(alternatives[0], depth + 1);
  if (record(schema.properties)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    return Object.fromEntries(
      Object.entries(schema.properties)
        .filter(([key]) => required.includes(key))
        .map(([key, value]) => [key, example(value, depth + 1)]),
    );
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 0;
  if (schema.type === "null") return null;
  return "";
}

export function starterArguments(schema: Record<string, unknown>): string {
  const value = example(schema);
  return JSON.stringify(record(value) ? value : {}, null, 2);
}

export function parseArguments(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Enter valid JSON, for example { "status": "all" }.');
  }
  if (!record(value)) throw new Error("Arguments must be a JSON object, not an array or value.");
  return value;
}

export function mcpResultText(result: McpPlaygroundResult): string {
  if (result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent, null, 2);
  }
  const text = result.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || JSON.stringify(result.content, null, 2);
  }
}
