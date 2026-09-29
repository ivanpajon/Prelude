import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appHtml,
  atomicWrite,
  bundledScript,
  bundleOptions,
  watchMcpApps,
} from "./build-mcp-apps.mjs";

const directories = [];
const watchers = [];
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "prelude-mcp-build-"));
  directories.push(root);
  return root;
}
afterEach(async () => {
  for (const { controller, done } of watchers.splice(0)) {
    controller.abort();
    await done.catch(() => {});
  }
  for (const root of directories.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith("prelude-mcp-build-")
    ) {
      throw new Error("Refusing to remove a directory outside the build test fixtures.");
    }
    await rm(root, { recursive: true, force: true });
  }
});
const result = (chunk = {}) => ({
  bundles: [
    {
      chunks: [
        {
          type: "chunk",
          code: "(() => { console.log('ready'); })();",
          imports: [],
          dynamicImports: [],
          referencedFiles: [],
          ...chunk,
        },
      ],
    },
  ],
});

describe("self-contained MCP App output", () => {
  it("bundles browser dependencies without declarations or emitted files", () => {
    const options = bundleOptions("/app", false);
    expect(options).toMatchObject({
      platform: "browser",
      target: "es2022",
      format: "iife",
      write: false,
      clean: false,
      dts: false,
      sourcemap: false,
      minify: true,
    });
    expect(options.deps.alwaysBundle[0].test("react-dom/client")).toBe(true);
    expect(options.deps.onlyImport).toEqual([]);
    expect(bundleOptions("/app", true).minify).toBe(false);
  });
  it("rejects extra assets, external imports and runtime require calls", () => {
    expect(bundledScript(result())).toContain("ready");
    for (const key of ["imports", "dynamicImports", "referencedFiles"]) {
      expect(() => bundledScript(result({ [key]: ["external.js"] }))).toThrow();
    }
    expect(() =>
      bundledScript({ bundles: [{ chunks: [result().bundles[0].chunks[0], { type: "asset" }] }] }),
    ).toThrow(/extra chunks/);
    expect(() => bundledScript(result({ code: "require('react');" }))).toThrow(/require/);
    expect(() => bundledScript(result({ code: "import x from 'react';" }))).toThrow();
  });
  it("keeps bridge configuration injectable and enforces no network or eval", () => {
    const html = appHtml("(() => {})();", "body { color: black; }");
    expect(html).toContain("<!--PRELUDE_MCP_APP_CONFIG-->");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("unsafe-eval");
    expect(() => appHtml("'</script>'", "")).toThrow(/terminator/);
    expect(() => appHtml("", "</style>")).toThrow(/terminator/);
    expect(() => appHtml("", '@import "external.css";')).toThrow(/imports/);
    expect(() =>
      appHtml("", 'body { background: url("https://example.test/image.png"); }'),
    ).toThrow(/assets/);
  });
  it("atomically replaces HTML and leaves no partial files", async () => {
    const root = await directory();
    const output = path.join(root, "generated/tasks.html");
    await atomicWrite(output, "first");
    await atomicWrite(output, "second");
    expect(await readFile(output, "utf8")).toBe("second");
    expect(await readdir(path.dirname(output))).toEqual(["tasks.html"]);
  });
});

describe("managed MCP App watcher", () => {
  it("rebuilds widget/shared source and preserves good output after failure", async () => {
    const root = await directory();
    const widget = path.join(root, "apps/web/src/mcp-apps");
    const shared = path.join(root, "packages/ui/src");
    await mkdir(widget, { recursive: true });
    await mkdir(shared, { recursive: true });
    const output = path.join(root, "tasks.html");
    let content = "first";
    let fail = false;
    const build = vi.fn(async () => {
      if (fail) throw new Error("invalid source");
      await atomicWrite(output, content);
    });
    const onReady = vi.fn();
    const onError = vi.fn();
    const controller = new AbortController();
    const done = watchMcpApps({ root, build, signal: controller.signal, onReady, onError });
    watchers.push({ controller, done });
    await expect.poll(() => onReady.mock.calls.length).toBe(1);
    content = "second";
    await writeFile(path.join(widget, "main.tsx"), content);
    await expect.poll(() => readFile(output, "utf8")).toBe("second");
    fail = true;
    await writeFile(path.join(shared, "theme.css"), "broken");
    await expect.poll(() => onError.mock.calls.length).toBeGreaterThan(0);
    expect(await readFile(output, "utf8")).toBe("second");
    fail = false;
    content = "third";
    await writeFile(path.join(shared, "theme.css"), "fixed");
    await expect.poll(() => readFile(output, "utf8")).toBe("third");
    expect(onReady).toHaveBeenCalledOnce();
    controller.abort();
    await done;
    expect(await readFile(output, "utf8")).toBe("third");
  });
  it("fails startup instead of announcing a stale artifact", async () => {
    const root = await directory();
    await mkdir(path.join(root, "apps/web/src/mcp-apps"), { recursive: true });
    await mkdir(path.join(root, "packages/ui/src"), { recursive: true });
    const onReady = vi.fn();
    await expect(
      watchMcpApps({
        root,
        onReady,
        build: async () => {
          throw new Error("broken first build");
        },
      }),
    ).rejects.toThrow("broken first build");
    expect(onReady).not.toHaveBeenCalled();
  });
});
