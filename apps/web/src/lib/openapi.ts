import "server-only";

import { experimental_ArkTypeToJsonSchemaConverter as ArkTypeToJsonSchemaConverter } from "@orpc/arktype";
import type { AnySchema } from "@orpc/contract";
import {
  OpenAPIGenerator,
  type OpenAPIGeneratorGenerateOptions,
  type SchemaConvertOptions,
} from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError } from "@orpc/server";
import { type Context, router } from "@repo/api";
import type { Type } from "arktype";

/** oRPC 1.15.4's converter does not select the input/output side of ArkType morphs. */
export class DirectionalArkTypeConverter extends ArkTypeToJsonSchemaConverter {
  override condition(schema: AnySchema | undefined) {
    // Claim every defined schema so oRPC cannot silently fall back to an empty schema.
    return schema !== undefined;
  }

  override convert(schema: AnySchema | undefined, options: SchemaConvertOptions) {
    if (!super.condition(schema)) throw new TypeError("Expected an ArkType schema.");
    const arkSchema = schema as Type;
    return super.convert(options.strategy === "input" ? arkSchema.in : arkSchema.out, options);
  }
}

const schemaConverters = [new DirectionalArkTypeConverter()];
const specOptions: OpenAPIGeneratorGenerateOptions = {
  info: {
    title: "Prelude API",
    version: "1.0.0",
    description:
      "Public, shared, in-memory demo tasks. Changes affect every visitor on this server instance and reset when it restarts. Reload or refetch the workbench to see changes made here.",
  },
  servers: [{ url: "/api" }],
  tags: [{ name: "Tasks", description: "Read and update the shared demo task list." }],
};
const generator = new OpenAPIGenerator({ schemaConverters });
const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters,
      specGenerateOptions: specOptions,
      docsPath: "/docs",
      specPath: "/openapi.json",
      docsProvider: "scalar",
      docsTitle: "Prelude API Reference",
      // Pin the renderer separately: the oRPC package version does not pin this CDN asset.
      docsScriptUrl:
        "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js",
      docsConfig: {
        withDefaultFonts: false,
        telemetry: false,
        agent: { disabled: true },
      },
    }),
  ],
  interceptors: [
    async ({ request, next }) => {
      if (
        (request.method === "PATCH" || request.method === "DELETE") &&
        /^\/api\/v1\/tasks\/[^/]+(?:\/title)?\/?$/.test(request.url.pathname)
      ) {
        if (request.url.searchParams.has("id")) {
          throw new ORPCError("BAD_REQUEST", { message: "Provide the task id only in the URL." });
        }
        let body: unknown;
        try {
          body = await request.body();
        } catch (cause) {
          throw new ORPCError("BAD_REQUEST", { message: "Malformed request body.", cause });
        }
        // oRPC compact inputs combine parameters and the body; IDs belong only in the URL path.
        if (body !== null && typeof body === "object" && Object.hasOwn(body, "id")) {
          throw new ORPCError("BAD_REQUEST", { message: "Provide the task id only in the URL." });
        }
      }
      return next();
    },
  ],
});

export function generateOpenApiSpec() {
  return generator.generate(router, specOptions);
}

export async function handleOpenApiRequest(request: Request, context: Context): Promise<Response> {
  const { response } = await handler.handle(request, { prefix: "/api", context });
  const result = response ?? new Response("Not found", { status: 404 });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
