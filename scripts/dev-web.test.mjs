import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  devCommands,
  inspectorEnvironment,
  parseDevOptions,
  resolvePackageBin,
  supervise,
  workspaceRoot,
} from "./dev-web.mjs";
import { checkCommand, parseCheckOptions } from "./mcp-check.mjs";

const directories = [];
const runs = [];
const servers = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "prelude-dev-"));
  directories.push(directory);
  return directory;
}

async function listen(server, port = 0) {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function freePorts(count = 2) {
  const holders = Array.from({ length: count }, () => createServer());
  const ports = await Promise.all(holders.map((server) => listen(server)));
  await Promise.all(holders.map((server) => new Promise((resolve) => server.close(resolve))));
  return ports;
}

const fixture = `
import { createServer } from "node:http";
import { existsSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
if (process.env.FIXTURE_MODE === "crash") process.exit(23);
if (process.env.FIXTURE_REQUIRED_FILE && !existsSync(process.env.FIXTURE_REQUIRED_FILE)) process.exit(42);
if (process.env.FIXTURE_BIND_DELAY_MS) await delay(Number(process.env.FIXTURE_BIND_DELAY_MS));
if (process.env.FIXTURE_REQUIRED_BOUND_PORT) await new Promise((resolve, reject) => {
  const contender = createServer();
  contender.once("error", (error) => error.code === "EADDRINUSE" ? resolve() : reject(error));
  contender.listen(Number(process.env.FIXTURE_REQUIRED_BOUND_PORT), "127.0.0.1", () => {
    contender.close(() => reject(new Error("The fixed application port was still available.")));
  });
});
if (process.env.FIXTURE_OWN_PID_FILE) writeFileSync(process.env.FIXTURE_OWN_PID_FILE, String(process.pid));
if (process.env.FIXTURE_GRANDCHILD_PORT) {
  const child = spawn(process.execPath, ["-e",
    'require("node:http").createServer((req,res) => res.end("grandchild")).listen(Number(process.env.FIXTURE_GRANDCHILD_PORT), "127.0.0.1")'
  ], { windowsHide: true, shell: false,
    stdio: process.env.FIXTURE_GRANDCHILD_IPC ? ["ignore", "ignore", "ignore", "ipc"] : "ignore"
  });
  writeFileSync(process.env.FIXTURE_PID_FILE, String(child.pid));
}
createServer((req, res) => {
  if (process.env.FIXTURE_MODE === "never-ready") res.statusCode = 503;
  res.end("fixture");
  if (req.url === "/exit") setTimeout(() => process.exit(23), 20);
}).listen(Number(process.env.FIXTURE_PORT), process.env.FIXTURE_HOST ?? "127.0.0.1");
if (process.env.FIXTURE_SANDBOX_PORT) createServer((req, res) => {
  if (req.method !== "GET" || req.url !== "/sandbox") res.statusCode = 404;
  res.end("sandbox");
}).listen(Number(process.env.FIXTURE_SANDBOX_PORT), "127.0.0.1");
`;

function fixtureCommand(port, mode = "ready", extraEnv = {}) {
  const cwd = temporaryDirectory();
  const script = path.join(cwd, "server.mjs");
  writeFileSync(script, fixture);
  return {
    name: `fixture ${port}`,
    script,
    args: [],
    cwd,
    env: { ...process.env, FIXTURE_PORT: String(port), FIXTURE_MODE: mode, ...extraEnv },
    port,
  };
}

function start(commands, options = {}) {
  const controller = new AbortController();
  let ready;
  const whenReady = new Promise((resolve) => {
    ready = resolve;
  });
  const done = supervise(commands, {
    signal: controller.signal,
    stdio: "ignore",
    startupTimeoutMs: 5000,
    onReady: ready,
    ...options,
  });
  // Failure tests intentionally inspect rejection after observing child state.
  done.catch(() => {});
  const readiness = Promise.race([whenReady, done]);
  readiness.catch(() => {});
  runs.push({ controller, done });
  return { controller, done, whenReady: readiness };
}

async function expectClosed(port) {
  await expect
    .poll(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) });
        return false;
      } catch {
        return true;
      }
    })
    .toBe(true);
}

async function expectGrandchildReady(port) {
  await expect
    .poll(async () => {
      try {
        return await (await fetch(`http://127.0.0.1:${port}`)).text();
      } catch {
        return "starting";
      }
    })
    .toBe("grandchild");
}

afterEach(async () => {
  for (const run of runs.splice(0)) {
    run.controller.abort();
    await run.done.catch(() => {});
  }
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(tmpdir()) ||
      !path.basename(target).startsWith("prelude-dev-")
    ) {
      throw new Error("Refusing to remove a directory outside the test fixtures.");
    }
    rmSync(target, { recursive: true, force: true });
  }
});

describe("development options and isolation", () => {
  it("uses fixed loopback defaults, explicit flags, and environment ports", () => {
    expect(parseDevOptions([], {})).toEqual({
      port: 3000,
      inspectorPort: 6274,
      sandboxPort: 6275,
      hostname: "127.0.0.1",
    });
    expect(
      parseDevOptions(["-p", "3102", "-H", "localhost", "--turbopack"], {
        PORT: "4000",
        MCP_INSPECTOR_PORT: "6280",
        MCP_SANDBOX_PORT: "6286",
      }),
    ).toEqual({ port: 3102, inspectorPort: 6280, sandboxPort: 6286, hostname: "127.0.0.1" });
    expect(parseDevOptions([], { PORT: "4000" }).port).toBe(4000);
  });

  it.each(["0", "-1", "65536", "1.5", "wat", "", " 3000", "03000"])(
    "rejects invalid port %j",
    (port) => {
      expect(() => parseDevOptions(["--port", port], {})).toThrow();
      expect(() => parseDevOptions([], { MCP_INSPECTOR_PORT: port })).toThrow();
      expect(() => parseDevOptions([], { MCP_SANDBOX_PORT: port })).toThrow();
    },
  );

  it("rejects non-loopback hosts, port collisions and unrecognized flags", () => {
    expect(() => parseDevOptions(["-H", "0.0.0.0"], {})).toThrow(/127\.0\.0\.1/);
    expect(() => parseDevOptions(["-p", "6274"], {})).toThrow(/different ports/);
    expect(() => parseDevOptions(["-p", "6275"], {})).toThrow(/different ports/);
    expect(() => parseDevOptions([], { MCP_INSPECTOR_PORT: "6275" })).toThrow(/different ports/);
    expect(() => parseDevOptions(["--experimental-https"], {})).toThrow();
    expect(() => parseDevOptions(["--server-url", "http://remote.test"], {})).toThrow();
    expect(() => parseDevOptions(["--container", "-H", "127.0.0.1"], {})).toThrow(
      /omit --hostname/,
    );
  });

  it("only binds wildcard interfaces after an explicit container option", () => {
    const inherited = { HOST: "0.0.0.0", DANGEROUSLY_BIND_ALL_INTERFACES: "true" };
    expect(parseDevOptions([], inherited).hostname).toBe("127.0.0.1");
    expect(parseDevOptions(["--container"], { PORT: "3102", MCP_INSPECTOR_PORT: "6284" })).toEqual({
      port: 3102,
      inspectorPort: 6284,
      sandboxPort: 6275,
      hostname: "0.0.0.0",
    });
  });

  it("isolates storage and scrubs inherited auth, catalog and exposure settings", () => {
    const root = temporaryDirectory();
    const env = inspectorEnvironment(
      root,
      { port: 3102, inspectorPort: 6274 },
      {
        PATH: "fixture-path",
        HOST: "0.0.0.0",
        CLIENT_PORT: "9999",
        SERVER_PORT: "9998",
        DANGEROUSLY_OMIT_AUTH: "true",
        dangerously_bind_all_interfaces: "1",
        MCP_INSPECTOR_API_TOKEN: "inherited-secret",
        MCP_PROXY_AUTH_TOKEN: "old-secret",
        MCP_CATALOG_PATH: "foreign-catalog",
        MCP_INSPECTOR_SECRET_STORE: "file",
        MCP_INSPECTOR_SECRET_KEY_FILE: "foreign-key",
        MCP_STORAGE_DIR: "foreign-storage",
        MCP_INSPECTOR_OAUTH_STATE_PATH: "foreign-oauth",
        MCP_CLIENT_CONFIG_PATH: "foreign-client",
        MCP_SANDBOX_FULL_ADDRESS: "https://remote.test",
        ALLOWED_ORIGINS: "https://remote.test",
        MCP_AUTO_OPEN_ENABLED: "true",
        MCP_LOG_FILE: "foreign-log",
        NO_PROXY: "example.test",
      },
    );
    expect(env).toMatchObject({
      HOST: "127.0.0.1",
      CLIENT_PORT: "6274",
      MCP_SANDBOX_PORT: "6275",
      MCP_SANDBOX_FULL_ADDRESS: "http://127.0.0.1:6275/sandbox",
      MCP_APP_ORIGIN_PORT: "0",
      MCP_AUTO_OPEN_ENABLED: "false",
      MCP_INSPECTOR_SECRET_STORE: "memory",
      PATH: "fixture-path",
    });
    for (const key of [
      "DANGEROUSLY_OMIT_AUTH",
      "dangerously_bind_all_interfaces",
      "MCP_INSPECTOR_API_TOKEN",
      "MCP_PROXY_AUTH_TOKEN",
      "MCP_CATALOG_PATH",
      "MCP_INSPECTOR_SECRET_KEY_FILE",
      "MCP_LOG_FILE",
      "SERVER_PORT",
    ])
      expect(env[key]).toBeUndefined();
    expect(env.MCP_STORAGE_DIR).toBe(path.join(root, ".tools", "mcp-inspector", "storage"));
    expect(env.MCP_INSPECTOR_OAUTH_STATE_PATH).toBe(path.join(env.MCP_STORAGE_DIR, "oauth.json"));
    expect(env.MCP_CLIENT_CONFIG_PATH).toBe(path.join(env.MCP_STORAGE_DIR, "client.json"));
    expect(env.ALLOWED_ORIGINS.split(",")).toEqual([
      "http://127.0.0.1:6274",
      "http://localhost:6274",
      "http://127.0.0.1:3102",
      "http://localhost:3102",
    ]);
    expect(env.NO_PROXY).toBe("example.test,127.0.0.1,localhost,::1");
  });

  it("prepares a read-only ad-hoc Inspector target using the exact application port", () => {
    const commands = devCommands(
      workspaceRoot,
      { port: 3102, inspectorPort: 6280 },
      { MCP_INSPECTOR_API_TOKEN: "secret" },
      { next: "next.js", inspector: "inspector.js" },
    );
    expect(commands[0]).toMatchObject({
      name: "MCP App builder",
      args: ["--watch"],
      readyMessage: "mcp-apps-ready",
      beforeServers: true,
    });
    expect(commands.map((command) => command.name)).toEqual([
      "MCP App builder",
      "Next.js",
      "MCP Inspector",
    ]);
    expect(commands[2].args).toEqual([
      "--web",
      "--server-url",
      "http://127.0.0.1:3102/api/mcp",
      "--transport",
      "http",
      "--protocol-era",
      "auto",
    ]);
    expect(commands[1].args).toEqual([
      "dev",
      "--turbopack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ]);
    expect(commands[1].beforeServers).toBe(true);
    expect(commands[1].env).toEqual({
      PORT: "3102",
      MCP_INSPECTOR_PORT: "6280",
      MCP_SANDBOX_PORT: "6275",
    });
  });

  it("preserves Inspector authentication and loopback URLs inside the container", () => {
    const commands = devCommands(
      workspaceRoot,
      parseDevOptions(["--container"], { PORT: "3102", MCP_INSPECTOR_PORT: "6284" }),
      {
        DANGEROUSLY_OMIT_AUTH: "true",
        DANGEROUSLY_BIND_ALL_INTERFACES: "false",
        MCP_INSPECTOR_API_TOKEN: "inherited-secret",
        ALLOWED_ORIGINS: "https://remote.test",
      },
      { next: "next.js", inspector: "inspector.js" },
    );
    const inspector = commands[2];
    expect(inspector.hostname).toBe("0.0.0.0");
    expect(inspector.args).toContain("http://127.0.0.1:3102/api/mcp");
    expect(inspector.env).toMatchObject({
      HOST: "0.0.0.0",
      DANGEROUSLY_BIND_ALL_INTERFACES: "true",
      CLIENT_PORT: "6284",
      MCP_SANDBOX_PORT: "6275",
      MCP_SANDBOX_FULL_ADDRESS: "http://127.0.0.1:6275/sandbox",
      MCP_INSPECTOR_SECRET_STORE: "memory",
      MCP_AUTO_OPEN_ENABLED: "false",
      ALLOWED_ORIGINS:
        "http://127.0.0.1:6284,http://localhost:6284,http://127.0.0.1:3102,http://localhost:3102",
    });
    expect(inspector.env.DANGEROUSLY_OMIT_AUTH).toBeUndefined();
    expect(inspector.env.MCP_INSPECTOR_API_TOKEN).toBeUndefined();
    expect(commands[1].args).toEqual([
      "dev",
      "--turbopack",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3102",
    ]);
    expect(commands[1].hostname).toBe("0.0.0.0");
    expect(commands[1].env.MCP_INSPECTOR_API_TOKEN).toBeUndefined();
  });

  it("loads Next development dotenv precedence before resolving helper options", () => {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, ".env"), "MCP_INSPECTOR_PORT=6200\n");
    writeFileSync(path.join(root, ".env.local"), "MCP_INSPECTOR_PORT=6201\n");
    const script = `import { loadDevEnvironment, parseDevOptions } from ${JSON.stringify(new URL("./dev-web.mjs", import.meta.url).href)};
      loadDevEnvironment(process.argv[1]);
      console.log(JSON.stringify(parseDevOptions([], process.env)));`;
    const env = {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3102",
      MCP_INSPECTOR_PORT: "6202",
    };
    const read = () =>
      JSON.parse(
        execFileSync(process.execPath, ["--input-type=module", "-e", script, root], {
          env,
          encoding: "utf8",
          windowsHide: true,
        })
          .trim()
          .split("\n")
          .at(-1),
      );
    expect(read().inspectorPort).toBe(6202);
    delete env.MCP_INSPECTOR_PORT;
    expect(read().inspectorPort).toBe(6201);
  }, 15_000);

  it("resolves package binaries without relying on PATH shims", () => {
    expect(resolvePackageBin("next", "next", path.join(workspaceRoot, "apps", "web"))).toMatch(
      /next[/\\]dist[/\\]bin[/\\]next$/,
    );
    expect(() => resolvePackageBin("prelude-nonexistent-fixture", "missing")).toThrow(
      /pnpm install/,
    );
  });
});

describe("owned development process lifecycle", () => {
  it("binds the app before an auxiliary server can claim its fixed port", async () => {
    const [appPort, inspectorPort] = await freePorts();
    const definitions = devCommands(
      workspaceRoot,
      { port: appPort, inspectorPort },
      {},
      { next: "next.js", inspector: "inspector.js" },
    );
    const commands = definitions.slice(1).map((definition) => ({
      ...fixtureCommand(
        definition.port,
        "ready",
        definition.name === "Next.js"
          ? { FIXTURE_BIND_DELAY_MS: "200" }
          : { FIXTURE_REQUIRED_BOUND_PORT: String(appPort) },
      ),
      beforeServers: definition.beforeServers,
    }));
    const run = start(commands);
    await run.whenReady;
    expect((await fetch(`http://127.0.0.1:${appPort}`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${inspectorPort}`)).status).toBe(200);
    run.controller.abort();
    await run.done;
    await Promise.all([appPort, inspectorPort].map(expectClosed));
  }, 10_000);

  it("waits for the initial builder IPC message before launching HTTP servers", async () => {
    const root = temporaryDirectory();
    const script = path.join(root, "builder.mjs");
    const output = path.join(root, "tasks.html");
    writeFileSync(
      script,
      `import { writeFileSync } from 'node:fs';
      setTimeout(() => { writeFileSync(process.env.FIXTURE_OUTPUT, 'ready'); process.send({ type: 'mcp-apps-ready' }); }, 100);
      setInterval(() => {}, 1000);`,
    );
    const [port] = await freePorts(1);
    const run = start([
      {
        name: "builder",
        script,
        args: [],
        cwd: root,
        env: { ...process.env, FIXTURE_OUTPUT: output },
        readyMessage: "mcp-apps-ready",
        beforeServers: true,
      },
      fixtureCommand(port, "ready", { FIXTURE_REQUIRED_FILE: output }),
    ]);
    await run.whenReady;
    expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
    run.controller.abort();
    await run.done;
    await expectClosed(port);
  }, 10_000);

  it("checks auxiliary GET-only sandbox readiness and closes its listener", async () => {
    const [port, sandboxPort] = await freePorts();
    const run = start([
      {
        ...fixtureCommand(port, "ready", { FIXTURE_SANDBOX_PORT: String(sandboxPort) }),
        listeners: [{ name: "sandbox", port: sandboxPort, method: "GET", path: "/sandbox" }],
      },
    ]);
    await run.whenReady;
    expect((await fetch(`http://127.0.0.1:${sandboxPort}/sandbox`)).status).toBe(200);
    run.controller.abort();
    await run.done;
    await Promise.all([port, sandboxPort].map(expectClosed));
  }, 10_000);

  it("refuses a sandbox collision before launching any child", async () => {
    const sandboxPort = await listen(createServer((_req, res) => res.end("unrelated")));
    const [port] = await freePorts(1);
    const run = start([
      { ...fixtureCommand(port), listeners: [{ name: "sandbox", port: sandboxPort }] },
    ]);
    await expect(run.done).rejects.toThrow(/sandbox cannot use/);
    expect(await (await fetch(`http://127.0.0.1:${sandboxPort}`)).text()).toBe("unrelated");
    await expectClosed(port);
  });

  it("waits for both children, then shuts down both ports on cancellation", async () => {
    const ports = await freePorts();
    const run = start(ports.map((port) => fixtureCommand(port)));
    await run.whenReady;
    for (const port of ports) expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
    run.controller.abort();
    await run.done;
    await Promise.all(ports.map(expectClosed));
  }, 10_000);

  it("probes and stops container listeners through their shared loopback interface", async () => {
    const ports = await freePorts();
    const commands = ports.map((port) => ({
      ...fixtureCommand(port, "ready", { FIXTURE_HOST: "0.0.0.0" }),
      hostname: "0.0.0.0",
    }));
    const run = start(commands);
    await run.whenReady;
    for (const port of ports) expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
    run.controller.abort();
    await run.done;
    await Promise.all(ports.map(expectClosed));
  }, 10_000);

  it("refuses occupied ports without stopping or reusing the existing server", async () => {
    const occupied = createServer((_req, res) => res.end("unrelated"));
    const port = await listen(occupied);
    const [otherPort] = await freePorts(1);
    const ready = vi.fn();
    const run = start([fixtureCommand(otherPort), fixtureCommand(port)], { onReady: ready });
    await expect(run.done).rejects.toThrow(/no existing process was stopped/);
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe("unrelated");
    expect(ready).not.toHaveBeenCalled();
    await expectClosed(otherPort);
  });

  it("shuts down its peer when a child fails during startup", async () => {
    const ports = await freePorts();
    const run = start([fixtureCommand(ports[0]), fixtureCommand(ports[1], "crash")]);
    await expect(run.done).rejects.toThrow(/exit 23/);
    await Promise.all(ports.map(expectClosed));
  }, 10_000);

  it("shuts down its peer when a ready child exits", async () => {
    const ports = await freePorts();
    const run = start(ports.map((port) => fixtureCommand(port)));
    await run.whenReady;
    await fetch(`http://127.0.0.1:${ports[0]}/exit`);
    await expect(run.done).rejects.toThrow(/exit 23/);
    await Promise.all(ports.map(expectClosed));
  }, 10_000);

  it("times out unhealthy startup and closes every owned child", async () => {
    const ports = await freePorts();
    const run = start(
      ports.map((port) => fixtureCommand(port, "never-ready")),
      { startupTimeoutMs: 700 },
    );
    await expect(run.done).rejects.toThrow(/not ready/);
    await Promise.all(ports.map(expectClosed));
  }, 10_000);

  it("also stops descendants rather than leaving an orphaned worker", async () => {
    const [port, grandchildPort] = await freePorts();
    const pidFile = path.join(temporaryDirectory(), "grandchild.pid");
    const run = start([
      fixtureCommand(port, "ready", {
        FIXTURE_GRANDCHILD_PORT: String(grandchildPort),
        FIXTURE_PID_FILE: pidFile,
      }),
    ]);
    await run.whenReady;
    await expectGrandchildReady(grandchildPort);
    expect(Number(readFileSync(pidFile, "utf8"))).toBeGreaterThan(0);
    run.controller.abort();
    await run.done;
    await Promise.all([port, grandchildPort].map(expectClosed));
  }, 10_000);

  it.each(["exit", "hard kill"])(
    "stops a listening IPC grandchild and peer after its parent's %s",
    async (failure) => {
      const [port, peerPort, grandchildPort] = await freePorts(3);
      const directory = temporaryDirectory();
      const parentPidFile = path.join(directory, "parent.pid");
      const run = start([
        fixtureCommand(port, "ready", {
          FIXTURE_OWN_PID_FILE: parentPidFile,
          FIXTURE_GRANDCHILD_PORT: String(grandchildPort),
          FIXTURE_GRANDCHILD_IPC: "1",
          FIXTURE_PID_FILE: path.join(directory, "grandchild.pid"),
        }),
        fixtureCommand(peerPort),
      ]);
      await run.whenReady;
      await expectGrandchildReady(grandchildPort);
      if (failure === "exit") {
        await fetch(`http://127.0.0.1:${port}/exit`);
      } else {
        process.kill(Number(readFileSync(parentPidFile, "utf8")), "SIGKILL");
      }
      await expect(run.done).rejects.toThrow(/stopped/);
      await Promise.all([port, peerPort, grandchildPort].map(expectClosed));
    },
    10_000,
  );

  it("stops children and forked descendants if the launcher itself is killed", async () => {
    const [port, grandchildPort] = await freePorts();
    const directory = temporaryDirectory();
    const command = fixtureCommand(port);
    const launcherScript = path.join(directory, "launcher.mjs");
    writeFileSync(
      launcherScript,
      `
      import { supervise } from ${JSON.stringify(new URL("./dev-web.mjs", import.meta.url).href)};
      const command = JSON.parse(process.argv[2]);
      command.env = { ...process.env, ...command.fixtureEnv };
      await supervise([command], { stdio: "ignore" });
    `,
    );
    const launcher = spawn(
      process.execPath,
      [
        launcherScript,
        JSON.stringify({
          name: command.name,
          script: command.script,
          args: [],
          cwd: command.cwd,
          port,
          fixtureEnv: {
            FIXTURE_PORT: String(port),
            FIXTURE_GRANDCHILD_PORT: String(grandchildPort),
            FIXTURE_GRANDCHILD_IPC: "1",
            FIXTURE_PID_FILE: path.join(directory, "grandchild.pid"),
          },
        }),
      ],
      { windowsHide: true, shell: false, stdio: "ignore" },
    );
    const exited = new Promise((resolve, reject) => {
      launcher.once("exit", resolve);
      launcher.once("error", reject);
    });
    try {
      await expectGrandchildReady(grandchildPort);
      expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
      launcher.kill("SIGKILL");
      await exited;
      await Promise.all([port, grandchildPort].map(expectClosed));
    } finally {
      if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill("SIGKILL");
      await exited;
    }
  }, 10_000);

  it("does not launch children after cancellation", async () => {
    const [port] = await freePorts(1);
    const controller = new AbortController();
    controller.abort();
    await supervise([fixtureCommand(port)], { signal: controller.signal });
    await delay(20);
    await expectClosed(port);
  });
});

describe("read-only MCP check", () => {
  it("defaults to the application port and accepts an explicit HTTP(S) target", () => {
    expect(parseCheckOptions([], {})).toEqual({ url: "http://127.0.0.1:3000/api/mcp" });
    expect(parseCheckOptions([], { PORT: "3102" }).url).toBe("http://127.0.0.1:3102/api/mcp");
    expect(parseCheckOptions(["--url", "https://example.test/api/mcp"], { PORT: "bad" }).url).toBe(
      "https://example.test/api/mcp",
    );
    for (const url of [
      "file:///tmp/mcp",
      "https://user:pass@example.test/api/mcp",
      "https://example.test/api/mcp#fragment",
    ])
      expect(() => parseCheckOptions(["--url", url], {})).toThrow();
    expect(() => parseCheckOptions(["--method", "tools/call"], {})).toThrow();
  });

  it("only lists tools and disables interactive authentication and browser launch", () => {
    const command = checkCommand("http://127.0.0.1:3102/api/mcp", workspaceRoot, {});
    expect(command.args).toEqual([
      "--cli",
      "--server-url",
      "http://127.0.0.1:3102/api/mcp",
      "--transport",
      "http",
      "--protocol-era",
      "auto",
      "--method",
      "tools/list",
      "--stored-auth-only",
    ]);
    expect(command.env.MCP_AUTO_OPEN_ENABLED).toBe("false");
    expect(command.env.MCP_INSPECTOR_SECRET_STORE).toBe("memory");
  });
});
