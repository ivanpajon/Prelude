import "server-only";

export type LogFields = Record<string, string | number | boolean | undefined>;

interface ErrorDescription {
  name?: string;
  message: string;
  stack?: string;
  issues?: { message: string; path?: string[] }[];
  cause?: ErrorDescription;
}

function describeIssue(issue: unknown) {
  if (typeof issue !== "object" || issue === null) return { message: String(issue) };
  const { message, path } = issue as { message?: unknown; path?: unknown };
  return {
    message: String(message),
    ...(Array.isArray(path)
      ? {
          path: path.map((segment) =>
            String(
              typeof segment === "object" && segment !== null
                ? (segment as { key?: unknown }).key
                : segment,
            ),
          ),
        }
      : {}),
  };
}

function describeError(error: unknown, stack: boolean, depth = 0): ErrorDescription {
  if (!(error instanceof Error)) return { message: String(error) };
  // Validation errors, such as invalid procedure output, list what failed. Their `data` holds
  // the invalid value itself, so only each issue's message and path are kept.
  const issues = "issues" in error && Array.isArray(error.issues) ? error.issues : undefined;
  return {
    name: error.name,
    message: error.message,
    ...(stack && error.stack ? { stack: error.stack } : {}),
    ...(issues ? { issues: issues.map(describeIssue) } : {}),
    ...(error.cause !== undefined && depth < 3
      ? { cause: describeError(error.cause, stack, depth + 1) }
      : {}),
  };
}

/**
 * Write one JSON line to stderr. Log drains and container runtimes collect it as is;
 * replace the body to forward errors to a reporting service.
 */
export function logServerError(
  message: string,
  error: unknown,
  fields: LogFields = {},
  { stack = true }: { stack?: boolean } = {},
) {
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      message,
      ...fields,
      error: describeError(error, stack),
    }),
  );
}
