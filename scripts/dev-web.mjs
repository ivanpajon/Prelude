import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

const help = `Start Next.js and the local MCP Inspector together.

  pnpm dev
  pnpm --filter @repo/web dev --port 3100

Options:
  --port, -p <port>          Next.js port (PORT, or 3000)
  --hostname, -H <hostname>  127.0.0.1 or localhost; always binds 127.0.0.1
  --container               Bind both servers to 0.0.0.0 inside an isolated container
  --turbopack                Accepted for compatibility; always enabled
  --help, -h                Show this help

MCP_INSPECTOR_PORT selects the Inspector port (default 6274).
MCP_SANDBOX_PORT selects its app preview sandbox port (default 6275).
All three ports must be free. No server reuses another process.
Container ports must be published on the host's loopback interface only.
`;

export function parsePort(value, label) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 65535) {
    throw new Error(`${label} must be an integer from 1 to 65535.`);
  }
  return Number(value);
}

export function parseDevOptions(args, env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", short: "p" },
      hostname: { type: "string", short: "H" },
      container: { type: "boolean" },
      turbopack: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (values.container && values.hostname) {
    throw new Error("--container chooses the bind host; omit --hostname.");
  }
  if (values.hostname && !["127.0.0.1", "localhost"].includes(values.hostname)) {
    throw new Error("The development server and Inspector must bind to 127.0.0.1.");
  }
  const port = parsePort(values.port ?? env.PORT ?? "3000", "Next.js port");
  const inspectorPort = parsePort(env.MCP_INSPECTOR_PORT ?? "6274", "MCP_INSPECTOR_PORT");
  const sandboxPort = parsePort(env.MCP_SANDBOX_PORT ?? "6275", "MCP_SANDBOX_PORT");
  if (new Set([port, inspectorPort, sandboxPort]).size !== 3) {
    throw new Error("Next.js, Inspector and its sandbox need different ports.");
  }
  return { port, inspectorPort, sandboxPort, hostname: values.container ? "0.0.0.0" : "127.0.0.1" };
}

export function resolvePackageBin(packageName, binName, from = workspaceRoot) {
  const require = createRequire(path.join(from, "package.json"));
  try {
    const manifestPath = require.resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binName];
    if (!bin) throw new Error(`Missing ${binName} binary.`);
    return path.resolve(path.dirname(manifestPath), bin);
  } catch (cause) {
    throw new Error(`Cannot resolve ${packageName}. Run pnpm install --frozen-lockfile.`, {
      cause,
    });
  }
}

export function loadDevEnvironment(app = path.join(workspaceRoot, "apps", "web")) {
  const require = createRequire(path.join(workspaceRoot, "apps", "web", "package.json"));
  const nextRequire = createRequire(require.resolve("next/package.json"));
  // Match Next's .env precedence before starting either child, so the helper
  // port and the server-rendered iframe always agree. Existing shell values win.
  nextRequire("@next/env").loadEnvConfig(app, true);
  return process.env;
}

export function inspectorEnvironment(root, options, env = process.env) {
  // Keep this checkout separate from a user's Inspector installation. Inherited
  // tokens, catalog paths and dangerous flags must not change this local helper.
  const result = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(MCP_|DANGEROUSLY_)/i.test(key) &&
        !["HOST", "CLIENT_PORT", "SERVER_PORT", "ALLOWED_ORIGINS"].includes(key.toUpperCase()),
    ),
  );
  const storage = path.join(root, ".tools", "mcp-inspector", "storage");
  const origins = [options.inspectorPort, options.port].flatMap((port) =>
    ["127.0.0.1", "localhost"].map((host) => new URL(`http://${host}:${port}`).origin),
  );
  return {
    ...result,
    HOST: options.hostname ?? "127.0.0.1",
    // Only the explicit container option opts in; inherited exposure and auth
    // settings were scrubbed above. Compose publishes these ports on loopback.
    ...(options.hostname === "0.0.0.0" ? { DANGEROUSLY_BIND_ALL_INTERFACES: "true" } : {}),
    CLIENT_PORT: String(options.inspectorPort),
    MCP_SANDBOX_PORT: String(options.sandboxPort ?? 6275),
    MCP_SANDBOX_FULL_ADDRESS: `http://127.0.0.1:${options.sandboxPort ?? 6275}/sandbox`,
    MCP_APP_ORIGIN_PORT: "0",
    ALLOWED_ORIGINS: origins.join(","),
    MCP_AUTO_OPEN_ENABLED: "false",
    MCP_INSPECTOR_SECRET_STORE: "memory",
    MCP_STORAGE_DIR: storage,
    MCP_INSPECTOR_OAUTH_STATE_PATH: path.join(storage, "oauth.json"),
    MCP_CLIENT_CONFIG_PATH: path.join(storage, "client.json"),
    MCP_INSPECTOR_LOG_DIR: path.join(root, ".tools", "mcp-inspector", "logs"),
    NO_PROXY: [env.NO_PROXY ?? env.no_proxy, "127.0.0.1", "localhost", "::1"]
      .filter(Boolean)
      .join(","),
    no_proxy: [env.NO_PROXY ?? env.no_proxy, "127.0.0.1", "localhost", "::1"]
      .filter(Boolean)
      .join(","),
  };
}

export function devCommands(root, options, env = process.env, binaries) {
  const app = path.join(root, "apps", "web");
  const nextEnv = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !/^(MCP_INSPECTOR_API_TOKEN|MCP_PROXY_AUTH_TOKEN)$/i.test(key),
    ),
  );
  return [
    {
      name: "MCP App builder",
      script: path.join(root, "scripts/build-mcp-apps.mjs"),
      args: ["--watch"],
      cwd: root,
      env: nextEnv,
      readyMessage: "mcp-apps-ready",
      beforeServers: true,
    },
    {
      name: "MCP Inspector",
      script:
        binaries?.inspector ??
        resolvePackageBin("@modelcontextprotocol/inspector", "mcp-inspector", root),
      args: [
        "--web",
        "--server-url",
        `http://127.0.0.1:${options.port}/api/mcp`,
        "--transport",
        "http",
        "--protocol-era",
        "auto",
      ],
      cwd: root,
      env: inspectorEnvironment(root, options, env),
      port: options.inspectorPort,
      listeners: [
        {
          name: "MCP App sandbox",
          port: options.sandboxPort ?? 6275,
          method: "GET",
          path: "/sandbox",
        },
      ],
      hostname: options.hostname ?? "127.0.0.1",
    },
    {
      name: "Next.js",
      script: binaries?.next ?? resolvePackageBin("next", "next", app),
      args: [
        "dev",
        "--turbopack",
        "--hostname",
        options.hostname ?? "127.0.0.1",
        "--port",
        String(options.port),
      ],
      cwd: app,
      env: {
        ...nextEnv,
        PORT: String(options.port),
        MCP_INSPECTOR_PORT: String(options.inspectorPort),
        MCP_SANDBOX_PORT: String(options.sandboxPort ?? 6275),
      },
      port: options.port,
      hostname: options.hostname ?? "127.0.0.1",
    },
  ];
}

async function assertPortsAvailable(commands) {
  const reservations = [];
  try {
    for (const command of commands.flatMap((command) => [
      ...(command.port ? [command] : []),
      ...(command.listeners ?? []).map((listener) => ({ ...command, ...listener })),
    ])) {
      const hostname = command.hostname ?? "127.0.0.1";
      const reservation = createServer();
      reservations.push(reservation);
      await new Promise((resolve, reject) => {
        reservation.once("error", (cause) => {
          reject(
            new Error(
              `${command.name} cannot use ${hostname}:${command.port}. Free that port or choose another; no existing process was stopped.`,
              { cause },
            ),
          );
        });
        reservation.listen({ port: command.port, host: hostname, exclusive: true }, resolve);
      });
    }
  } finally {
    await Promise.all(
      reservations.map((server) => new Promise((resolve) => server.close(() => resolve()))),
    );
  }
}

function probe(listener, signal) {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: listener.port,
        path: listener.path ?? "/",
        method: listener.method ?? "HEAD",
        signal,
        timeout: 1000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 400);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function waitUntilReady(owned, signal) {
  const { command } = owned;
  if (command.readyMessage) {
    if (owned.isReady()) return;
    await new Promise((resolve, reject) => {
      const ready = (message) => {
        if (message?.type === command.readyMessage) {
          cleanup();
          resolve();
        }
      };
      const aborted = () => {
        cleanup();
        reject(signal.reason);
      };
      const cleanup = () => {
        owned.child.removeListener("message", ready);
        signal.removeEventListener("abort", aborted);
      };
      owned.child.on("message", ready);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
    return;
  }
  while (!signal.aborted) {
    if (
      (
        await Promise.all(
          [command, ...(command.listeners ?? [])].map((listener) => probe(listener, signal)),
        )
      ).every(Boolean)
    )
      return;
    await delay(100, undefined, { signal });
  }
  signal.throwIfAborted();
}

function startChild(command, stdio) {
  const child = spawn(process.execPath, [command.script, ...command.args], {
    cwd: command.cwd,
    env: {
      ...command.env,
      NODE_OPTIONS: [
        command.env.NODE_OPTIONS,
        `--import=${new URL("./dev-child-lifetime.mjs", import.meta.url).href}`,
      ]
        .filter(Boolean)
        .join(" "),
    },
    stdio: [stdio, stdio, stdio, "ipc"],
    shell: false,
    windowsHide: true,
    // Each POSIX process group contains only this child and its descendants.
    detached: process.platform !== "win32",
  });
  let ended = false;
  let ready = false;
  child.on("message", (message) => {
    if (message?.type === command.readyMessage) ready = true;
  });
  const done = new Promise((resolve) => {
    child.once("error", (error) => {
      ended = true;
      resolve({ error });
    });
    child.once("exit", (code, signal) => {
      ended = true;
      resolve({ code, signal });
    });
  });
  return { child, done, command, hasEnded: () => ended, isReady: () => ready };
}

async function stopChild(owned) {
  const pid = owned.child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    if (owned.hasEnded()) return;
    // Windows signals do not terminate a child tree. Target our own spawned PID,
    // never a process discovered from a port (which may belong to someone else).
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
    return;
  }
  const signalGroup = (signal) => {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  signalGroup("SIGTERM");
  // A child can exit before a grandchild, so allow graceful shutdown before
  // killing the remainder of this process group, even if its leader has exited.
  await delay(300);
  signalGroup("SIGKILL");
}

export async function supervise(
  commands,
  { signal, onReady = () => {}, stdio = "inherit", startupTimeoutMs = 60_000 } = {},
) {
  if (signal?.aborted) return;
  await assertPortsAvailable(commands);
  if (signal?.aborted) return;
  const failed = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, failed.signal]) : failed.signal;
  const owned = [];
  try {
    const startup = AbortSignal.any([lifetime, AbortSignal.timeout(startupTimeoutMs)]);
    try {
      for (const command of commands) {
        startup.throwIfAborted();
        const process = startChild(command, stdio);
        owned.push(process);
        process.done.then((result) => {
          failed.abort(
            new Error(
              `${command.name} stopped${result.error ? `: ${result.error.message}` : ` (${result.signal ?? `exit ${result.code}`})`}. Development processes are shutting down.`,
            ),
          );
        });
        if (command.beforeServers) await waitUntilReady(process, startup);
      }
      await Promise.all(owned.map((process) => waitUntilReady(process, startup)));
      startup.throwIfAborted();
    } catch {
      if (signal?.aborted) return;
      if (failed.signal.aborted) throw failed.signal.reason;
      throw new Error(
        `Development servers were not ready within ${startupTimeoutMs / 1000} seconds.`,
      );
    }
    onReady();
    if (!lifetime.aborted) {
      await new Promise((resolve) => lifetime.addEventListener("abort", resolve, { once: true }));
    }
    if (!signal?.aborted) throw failed.signal.reason;
  } finally {
    await Promise.all(owned.map(stopChild));
  }
}

export async function devMain(args = process.argv.slice(2), env = loadDevEnvironment()) {
  const options = parseDevOptions(args, env);
  if (options.help) {
    console.log(help);
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await supervise(devCommands(workspaceRoot, options, env), {
      signal: controller.signal,
      onReady: () =>
        console.log(`MCP Inspector: http://127.0.0.1:${options.port}/api/mcp/inspector`),
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  devMain().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
