import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceRoot } from "./dev-web.mjs";

function read(file) {
  return readFileSync(path.join(workspaceRoot, file), "utf8");
}

/** The pull request path filters of docker.yml, optionally without its demo block. */
function pullRequestPaths({ demo }) {
  const lines = read(".github/workflows/docker.yml").split(/\r?\n/);
  const start = lines.indexOf("    paths:", lines.indexOf("  pull_request:"));
  const paths = [];
  let inDemo = false;
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("      ")) break;
    const text = line.trim();
    if (text === "# demo:start") inDemo = true;
    else if (text === "# demo:end") inDemo = false;
    else if (text.startsWith("- ") && (demo || !inDemo)) {
      paths.push(text.slice(2).replace(/^"(.*)"$/, "$1"));
    }
  }
  return paths;
}

/** The given files and every repository file they load through relative imports. */
function withLocalImports(files) {
  const found = new Set();
  const visit = (file) => {
    if (found.has(file)) return;
    found.add(file);
    const imports = read(file).matchAll(
      /^(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s+)?"(\.{1,2}\/[^"]+)"/gms,
    );
    for (const [, specifier] of imports) {
      const target = path.posix.join(path.posix.dirname(file), specifier);
      const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find(
        (candidate) => existsSync(path.join(workspaceRoot, candidate)),
      );
      if (!resolved) throw new Error(`${file} imports ${specifier}, which does not exist.`);
      visit(resolved);
    }
  };
  for (const file of files) visit(file);
  return [...found];
}

function typeScriptFiles(directory) {
  return readdirSync(path.join(workspaceRoot, directory))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `${directory}/${name}`);
}

function unmatched(files, patterns) {
  return files.filter((file) => !patterns.some((pattern) => path.posix.matchesGlob(file, pattern)));
}

// The Docker lane runs on pull requests only when they change a listed path. A stack spec
// that loads an unlisted file would let a pull request break it without running it.
describe("Docker workflow", () => {
  const stack = ["scripts/test-stack.mjs", "playwright.stack.config.ts"];

  it("runs on pull requests that change a file the stack test loads", () => {
    const files = withLocalImports([...stack, ...typeScriptFiles("tests/stack")]);
    expect(files).toContain("tests/hydration.ts");
    expect(unmatched(files, pullRequestPaths({ demo: false }))).toEqual([]);
  });

  // demo:start
  it("also runs when a file that only the demo's stack specs load changes", () => {
    const files = withLocalImports([...stack, ...typeScriptFiles("tests/stack/demo")]);
    expect(files).toContain("tests/demo/mcp-apps.ts");
    expect(unmatched(files, pullRequestPaths({ demo: true }))).toEqual([]);
  });
  // demo:end
});
