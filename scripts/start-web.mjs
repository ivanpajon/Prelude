import { spawn } from "node:child_process";
import path from "node:path";
import { resolvePackageBin, workspaceRoot } from "./dev-web.mjs";

// Serve the production build with Next.js started by Node directly. On Windows a nested
// `pnpm --filter` and the `next.cmd` shim each run a batch file, and after Ctrl+C each one
// asks "Terminate batch job (Y/N)?", so one Ctrl+C did not stop `pnpm start`.

export function startCommand(args, root = workspaceRoot) {
  const app = path.join(root, "apps", "web");
  return { script: resolvePackageBin("next", "next", app), args: ["start", ...args], cwd: app };
}

// Exit codes of a clean stop: SIGINT and SIGTERM from Next.js, and Windows' STATUS_CONTROL_C_EXIT
// when Ctrl+C arrives before Next.js has set up its own handlers.
const stopCodes = [0, 130, 143, 0xc000013a];

/** The launcher's exit code: a stop that Next.js finished cleanly is a success. */
export function exitCode({ code, signal }, stopping) {
  if (stopping && (signal !== null || stopCodes.includes(code))) return 0;
  return code ?? 1;
}

export async function startMain(
  args = process.argv.slice(2),
  { command = startCommand(args), signals = process } = {},
) {
  const child = spawn(process.execPath, [command.script, ...command.args], {
    cwd: command.cwd,
    stdio: "inherit",
  });
  let stopping = false;
  // Ctrl+C also reaches Next.js, which ignores repeated stop signals. Windows can only
  // force-kill a child, so there the launcher just waits for Next.js to shut down.
  const stop = (signal) => {
    stopping = true;
    if (process.platform !== "win32") child.kill(signal);
  };
  signals.on("SIGINT", stop);
  signals.on("SIGTERM", stop);
  return new Promise((resolve, reject) => {
    const done = () => {
      signals.removeListener("SIGINT", stop);
      signals.removeListener("SIGTERM", stop);
    };
    child.once("error", (error) => {
      done();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      done();
      resolve(exitCode({ code, signal }, stopping));
    });
  });
}

if (import.meta.main) {
  startMain().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
