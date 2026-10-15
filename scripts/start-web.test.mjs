import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePackageBin, workspaceRoot } from "./dev-web.mjs";
import { exitCode, startCommand, startMain } from "./start-web.mjs";

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** A stand-in for Next.js that exits with `code` after `delay` milliseconds. */
function fakeServer(code, delay) {
  const directory = mkdtempSync(path.join(tmpdir(), "prelude-start-"));
  directories.push(directory);
  const script = path.join(directory, "server.mjs");
  writeFileSync(script, `setTimeout(() => process.exit(${code}), ${delay});\n`);
  return { script, args: [], cwd: directory };
}

describe("production start launcher", () => {
  it("runs from the root script without pnpm or a .cmd shim, so one Ctrl+C stops it on Windows", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(workspaceRoot, "package.json"), "utf8"));
    expect(scripts.start).toBe("node scripts/start-web.mjs");
  });

  it("starts Next.js from the web app with the given options", () => {
    const app = path.join(workspaceRoot, "apps", "web");
    expect(startCommand(["--port", "3001"])).toEqual({
      script: resolvePackageBin("next", "next", app),
      args: ["start", "--port", "3001"],
      cwd: app,
    });
  });

  it("reports a clean stop as success and keeps every other exit code", () => {
    expect(exitCode({ code: 130, signal: null }, true)).toBe(0);
    expect(exitCode({ code: 143, signal: null }, true)).toBe(0);
    expect(exitCode({ code: null, signal: "SIGTERM" }, true)).toBe(0);
    expect(exitCode({ code: 0xc000013a, signal: null }, true)).toBe(0);
    expect(exitCode({ code: 1, signal: null }, true)).toBe(1);
    expect(exitCode({ code: 130, signal: null }, false)).toBe(130);
    expect(exitCode({ code: null, signal: "SIGKILL" }, false)).toBe(1);
  });

  it("exits with the server's code when it stops on its own", async () => {
    const signals = new EventEmitter();
    await expect(startMain([], { command: fakeServer(3, 0), signals })).resolves.toBe(3);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("stops the server after Ctrl+C and then exits cleanly", async () => {
    const signals = new EventEmitter();
    // Windows Ctrl+C reaches the server directly, so it stops on its own there. Elsewhere it
    // would run for a minute, so the test passes only if the launcher forwards the signal.
    const delay = process.platform === "win32" ? 200 : 60_000;
    const started = startMain([], { command: fakeServer(130, delay), signals });
    signals.emit("SIGINT", "SIGINT");
    await expect(started).resolves.toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });
});
