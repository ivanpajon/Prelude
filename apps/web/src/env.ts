import "server-only";

/** Runtime variables read by the server. They apply without rebuilding. */
export interface RuntimeEnvironment {
  NODE_ENV?: string | undefined;
  MCP_ENABLED?: string | undefined;
  MCP_ALLOWED_ORIGINS?: string | undefined;
  MCP_INSPECTOR_PORT?: string | undefined;
}

export interface ServerEnvironment {
  development: boolean;
  /** `MCP_ENABLED`: true unless set to `false`. */
  mcpEnabled: boolean;
  /** `MCP_ALLOWED_ORIGINS`: exact browser origins accepted by `/api/mcp` in production. */
  mcpAllowedOrigins: readonly string[];
  /** `MCP_INSPECTOR_PORT`: the local Inspector UI port, used in development only. */
  mcpInspectorPort: number;
}

/** Return the normalized origin of an exact HTTP(S) origin, or undefined for anything else. */
export function parseOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.includes("*")
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Parse the runtime environment. Callers may run this per request, so a changed value
 * applies without a rebuild. Invalid values throw one error that names every variable.
 * Variables that have no effect (origins while MCP is off, the Inspector port outside
 * development) are not checked.
 */
export function parseServerEnvironment(
  environment: RuntimeEnvironment = process.env,
): ServerEnvironment {
  const problems: string[] = [];
  const development = environment.NODE_ENV === "development";

  const enabled = environment.MCP_ENABLED?.trim().toLowerCase();
  if (enabled !== undefined && enabled !== "true" && enabled !== "false") {
    problems.push("MCP_ENABLED must be true or false.");
  }
  const mcpEnabled = enabled !== "false";

  const origins =
    mcpEnabled && environment.MCP_ALLOWED_ORIGINS?.trim()
      ? environment.MCP_ALLOWED_ORIGINS.split(",").map((entry) => parseOrigin(entry.trim()))
      : [];
  const mcpAllowedOrigins = origins.filter((origin) => origin !== undefined);
  if (mcpAllowedOrigins.length !== origins.length) {
    problems.push(
      "MCP_ALLOWED_ORIGINS must be a comma-separated list of exact HTTP(S) origins, such as https://app.example.com.",
    );
  }

  const port = environment.MCP_INSPECTOR_PORT ?? "6274";
  if (development && (!/^[1-9]\d*$/.test(port) || Number(port) > 65535)) {
    problems.push("MCP_INSPECTOR_PORT must be an integer from 1 to 65535.");
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment variables:\n  ${problems.join("\n  ")}`);
  }
  return { development, mcpEnabled, mcpAllowedOrigins, mcpInspectorPort: Number(port) };
}
