import "server-only";

export type LogFields = Record<string, string | number | boolean | undefined>;

function describeError(error: unknown, stack: boolean) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...(stack && error.stack ? { stack: error.stack } : {}),
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
