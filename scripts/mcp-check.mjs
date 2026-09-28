import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { inspectorEnvironment, parsePort, resolvePackageBin, workspaceRoot } from "./dev-web.mjs";

export function parseCheckOptions(args, env = process.env) {
  const { values } = parseArgs({
    args,
    options: { url: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  const url = new URL(
    values.url ?? `http://127.0.0.1:${parsePort(env.PORT ?? "3000", "PORT")}/api/mcp`,
  );
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("--url must be an HTTP(S) MCP endpoint without credentials or a fragment.");
  }
  return { url: url.href };
}

export function checkCommand(url, root = workspaceRoot, env = process.env) {
  return {
    args: [
      "--cli",
      "--server-url",
      url,
      "--transport",
      "http",
      "--protocol-era",
      "auto",
      "--method",
      "tools/list",
      "--stored-auth-only",
    ],
    env: inspectorEnvironment(root, { port: 3000, inspectorPort: 6274 }, env),
  };
}

export function checkMain(args = process.argv.slice(2), env = process.env) {
  const options = parseCheckOptions(args, env);
  if (options.help) {
    console.log(`List MCP tools without executing them.

  pnpm mcp:check
  pnpm mcp:check --url http://127.0.0.1:3100/api/mcp

The default endpoint uses PORT, or 3000. Start the application first.
`);
    return 0;
  }
  const command = checkCommand(options.url, workspaceRoot, env);
  const result = spawnSync(
    process.execPath,
    [resolvePackageBin("@modelcontextprotocol/inspector", "mcp-inspector"), ...command.args],
    {
      cwd: workspaceRoot,
      env: command.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      timeout: 30_000,
    },
  );
  if (result.error) throw new Error(`MCP check failed: ${result.error.message}`);
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = checkMain();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
