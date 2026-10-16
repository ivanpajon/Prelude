import "server-only";

import { experimental_ArkTypeToJsonSchemaConverter as ArkTypeToJsonSchemaConverter } from "@orpc/arktype";
import { type AnySchema, fallbackContractConfig } from "@orpc/contract";
import {
  OpenAPIGenerator,
  type OpenAPIGeneratorGenerateOptions,
  type SchemaConvertOptions,
} from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { StandardOpenAPIMatcher } from "@orpc/openapi/standard";
import { type AnyRouter, type InferRouterInitialContext, ORPCError, onError } from "@orpc/server";
import { BodyLimitPlugin } from "@orpc/server/fetch";
import { router } from "@repo/api";
import type { Type } from "arktype";
import { logUnexpectedApiError, logUnexpectedHandlerErrors } from "./api-errors";
import { apiInfo, scalarScriptIntegrity, scalarScriptUrl } from "./api-info";
import { plainRequest } from "./plain-request";

/** oRPC 1.15.6's converter does not select the input/output side of ArkType morphs. */
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

/**
 * The top-level key of a bracket-notation key, as oRPC 1.15.6 decodes it: `id[0]` and `\id[0]`
 * both become `id`, because a backslash escapes the next character before the first bracket.
 * A key without an unescaped `[` stays as written.
 */
function topLevelKey(key: string) {
  let segment = "";
  let backslashes = 0;
  for (const character of key) {
    if (character === "[" && backslashes % 2 === 0) return segment;
    if (character === "\\") {
      backslashes++;
    } else {
      segment += "\\".repeat(Math.floor(backslashes / 2)) + character;
      backslashes = 0;
    }
  }
  return key;
}

/** Top-level input keys, as oRPC decodes them from a query string, form or JSON object. */
function inputKeys(value: unknown): string[] {
  if (value instanceof URLSearchParams || value instanceof FormData) {
    return [...value.keys()].map(topLevelKey);
  }
  if (value === null || typeof value !== "object") return [];
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? Object.keys(value) : [];
}

async function readBody(read: () => Promise<unknown>) {
  try {
    return await read();
  } catch (cause) {
    // Keep oRPC's own errors, such as 413 from the body limit.
    if (cause instanceof ORPCError) throw cause;
    throw new ORPCError("BAD_REQUEST", { message: "Malformed request body.", cause });
  }
}

/**
 * Creates the REST adapter and OpenAPI document for a router.
 *
 * oRPC's compact inputs merge path parameters with the query (GET) or the body (other methods).
 * Since oRPC 1.15.5 the value from the URL wins, so a repeated key would be dropped silently.
 * Requests that repeat a path parameter in the query or body return 400 instead, even when the
 * values match.
 */
export function createOpenApi<TRouter extends AnyRouter>(
  apiRouter: TRouter,
  specOptions: OpenAPIGeneratorGenerateOptions,
) {
  // OpenAPI 3.1 requires paths, components, or webhooks. oRPC adds paths only for a procedure, so
  // start from an empty object to keep a contract without procedures valid.
  const generateOptions = { paths: {}, ...specOptions };
  const schemaConverters = [new DirectionalArkTypeConverter()];
  const generator = new OpenAPIGenerator({ schemaConverters });
  const matcher = new StandardOpenAPIMatcher();
  matcher.init(apiRouter);
  const logging = logUnexpectedHandlerErrors<InferRouterInitialContext<TRouter>>("rest");
  const docsPath = "/docs";
  const handler = new OpenAPIHandler(apiRouter, {
    plugins: [
      new BodyLimitPlugin({ maxBodySize: 64 * 1024 }),
      new OpenAPIReferencePlugin({
        schemaConverters,
        specGenerateOptions: generateOptions,
        docsPath,
        specPath: "/openapi.json",
        docsProvider: "scalar",
        docsTitle: `${apiInfo.title} Reference`,
        docsScriptUrl: scalarScriptUrl,
        docsConfig: {
          withDefaultFonts: false,
          telemetry: false,
          agent: { disabled: true },
        },
      }),
    ],
    rootInterceptors: logging.rootInterceptors,
    interceptors: [
      ...logging.interceptors,
      async ({ request, prefix, next }) => {
        // Match the same way oRPC does, before it decodes the input.
        const pathname = prefix ? request.url.pathname.replace(prefix, "") : request.url.pathname;
        const match = await matcher.match(request.method, `/${pathname.replace(/^\/|\/$/g, "")}`);
        const parameters = Object.keys(match?.params ?? {});
        const structure = match
          ? fallbackContractConfig(
              "defaultInputStructure",
              match.procedure["~orpc"].route.inputStructure,
            )
          : undefined;
        if (parameters.length > 0 && structure === "compact") {
          const keys = inputKeys(request.url.searchParams);
          if (request.method !== "GET") keys.push(...inputKeys(await readBody(request.body)));
          const repeated = parameters.find((parameter) => keys.includes(parameter));
          if (repeated) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Provide "${repeated}" only in the URL path.`,
            });
          }
        }
        return next();
      },
      async ({ request, prefix, next }) => {
        const result = await next();
        const { response } = result;
        // The reference plugin answers its docs path with an HTML file, unless a procedure
        // takes that path first.
        const docs = request.url.pathname.replace(/\/$/, "") === `${prefix ?? ""}${docsPath}`;
        if (!docs || !(response?.body instanceof Blob) || response.body.type !== "text/html") {
          return result;
        }
        const html = hardenDocsHtml(await response.body.text());
        const body = new File([html], "api-reference.html", { type: "text/html" });
        return { matched: true, response: { ...response, body } };
      },
    ],
    // Wraps only the procedure call: malformed requests fail earlier and return 4xx quietly.
    // MCP tools dispatch through this handler, so their failures are logged here once. A 5xx
    // from outside the call, such as generating the OpenAPI document, is logged by `logging`.
    clientInterceptors: [onError(logUnexpectedApiError("rest"))],
  });

  return {
    generateSpec() {
      return generator.generate(apiRouter, generateOptions);
    },
    async handle(request: Request, context: InferRouterInitialContext<TRouter>): Promise<Response> {
      const { response } = await handler.handle(plainRequest(request), { prefix: "/api", context });
      const result = response ?? new Response("Not found", { status: 404 });
      result.headers.set("Cache-Control", "no-store");
      return result;
    },
  };
}

/**
 * Adds the Scalar script's integrity hash and the page language to the reference page that
 * oRPC renders. This keeps oRPC's own renderer, which escapes the embedded document. If an
 * oRPC update changes the expected tags, this throws instead of serving the page without them.
 */
export function hardenDocsHtml(html: string) {
  const script = `<script src="${scalarScriptUrl}">`;
  if (!html.includes(script) || !html.includes("<html>")) {
    throw new Error(
      "Unexpected API reference HTML from oRPC; update hardenDocsHtml in openapi.ts.",
    );
  }
  return html
    .replace(
      script,
      `<script src="${scalarScriptUrl}" integrity="${scalarScriptIntegrity}" crossorigin="anonymous">`,
    )
    .replace("<html>", '<html lang="en">');
}

const openApi = createOpenApi(router, {
  info: {
    ...apiInfo,
    // demo:start
    description:
      "Public, shared, in-memory demo tasks. Changes affect every visitor on this server instance and reset when it restarts. Reload or refetch the workbench to see changes made here.",
    // demo:end
  },
  servers: [{ url: "/api" }],
  // demo:start
  tags: [{ name: "Tasks", description: "Read and update the shared demo task list." }],
  // demo:end
});

export const generateOpenApiSpec = openApi.generateSpec;
export const handleOpenApiRequest = openApi.handle;
