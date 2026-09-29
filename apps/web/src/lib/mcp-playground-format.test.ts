import { describe, expect, it } from "vitest";
import { mcpResultText, parseArguments, starterArguments } from "./mcp-playground-format";
import { McpPlaygroundError } from "./mcp-playground-types";

describe("playground JSON editing", () => {
  it("suggests required fields from schemas, including enums without a string type", () => {
    expect(
      JSON.parse(
        starterArguments({
          type: "object",
          required: ["status", "completed", "options"],
          properties: {
            status: { enum: ["all", "active", "completed"] },
            completed: { type: "boolean" },
            options: {
              type: "object",
              required: ["limit"],
              properties: { limit: { type: "integer", minimum: 1 }, unused: { type: "string" } },
            },
            optional: { type: "string" },
          },
        }),
      ),
    ).toEqual({ status: "all", completed: false, options: { limit: 1 } });
    expect(starterArguments({ examples: [{ title: "Build a feature" }] })).toContain(
      "Build a feature",
    );
  });

  it("allows JSON objects but catches malformed and non-object arguments before sending", () => {
    expect(parseArguments('{"completed":false,"title":"  Keep spaces  "}')).toEqual({
      completed: false,
      title: "  Keep spaces  ",
    });
    for (const text of ["null", "[]", "true", '"hello"']) {
      expect(() => parseArguments(text)).toThrow(new McpPlaygroundError("errorObjectRequired"));
    }
    expect(() => parseArguments('{"title":}')).toThrow(new McpPlaygroundError("errorInvalidJson"));
  });

  it("preserves natural structured arrays, null, and public tool error text", () => {
    expect(JSON.parse(mcpResultText({ structuredContent: [{ id: "one" }], content: [] }))).toEqual([
      { id: "one" },
    ]);
    expect(mcpResultText({ structuredContent: null, content: [] })).toBe("null");
    expect(
      JSON.parse(
        mcpResultText({
          isError: true,
          content: [{ type: "text", text: '{"message":"Not found"}' }],
        }),
      ),
    ).toEqual({ message: "Not found" });
    expect(mcpResultText({ content: [{ type: "text", text: "A plain text response" }] })).toBe(
      "A plain text response",
    );
  });
});
