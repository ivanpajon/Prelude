import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demo,
  formatJson,
  generated,
  markerKind,
  planRemoval,
  removeDemo,
  stripDemoBlocks,
  tooling,
} from "./remove-demo.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoots = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "prelude remove-demo "));
  temporaryRoots.push(directory);
  return directory;
}

function write(root, file, content) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

function read(root, file) {
  return readFileSync(path.join(root, file), "utf8");
}

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
}

/** Joins lines with LF, so fixtures do not depend on this file's line endings. */
const lines = (...items) => `${items.join("\n")}\n`;

const fixtureLists = {
  demo: {
    delete: ["src/demo.ts", "tests/demo", "scripts/remove-demo.test.mjs"],
    marked: ["src/index.ts", "README.md"],
    json: [
      { file: "package.json", delete: ["dependencies", "demo-only"] },
      { file: "package.json", set: ["scripts", "build"], to: "next build" },
      { file: "turbo.json", pull: ["outputs"], item: ".generated/**" },
    ],
  },
  tooling: {
    delete: ["scripts/remove-demo.mjs"],
    json: [{ file: "package.json", delete: ["scripts", "remove-demo"] }],
  },
  generated: ["apps/web/.next/dev/types"],
};

function fixture() {
  const root = temporaryDirectory();
  git(root, "init", "--quiet");
  write(root, "package.json", {
    name: "fixture",
    scripts: { build: "demo && next build", "remove-demo": "node scripts/remove-demo.mjs" },
    dependencies: { "demo-only": "1.0.0", next: "1.0.0" },
  });
  write(root, "turbo.json", { outputs: [".next/**", ".generated/**"] });
  write(root, "src/demo.ts", "export const demo = true;\n");
  write(root, "tests/demo/demo.spec.ts", "test();\n");
  write(root, "scripts/remove-demo.mjs", "// tool\n");
  write(root, "scripts/remove-demo.test.mjs", "// tool test\n");
  write(
    root,
    "src/index.ts",
    lines(
      "export const a = 1;",
      "// demo:start",
      "",
      "export { demo } from './demo';",
      "",
      "// demo:end",
      "",
      "export const b = 2;",
    ),
  );
  write(
    root,
    "README.md",
    lines(
      "# Fixture",
      "",
      "<!-- demo:start -->",
      "Try the demo.",
      "<!-- demo:end -->",
      "",
      "## Next",
    ),
  );
  git(root, "add", ".");
  commit(root, "chore: baseline");
  return root;
}

function commit(root, message) {
  // A throwaway identity for this fixture only; the user's Git configuration is not changed.
  git(
    root,
    ...["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com"],
    ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-am", message],
  );
}

function snapshot(root) {
  const files = {};
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files[path.relative(root, absolute)] = readFileSync(absolute).toString("base64");
    }
  }
  visit(root);
  return files;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    // Only remove directories created by this test helper under the system temp directory.
    expect(path.dirname(realpathSync.native(root))).toBe(realpathSync.native(tmpdir()));
    expect(path.basename(root)).toMatch(/^prelude remove-demo /);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("demo markers", () => {
  it("strips code, JSX, YAML, and Markdown blocks with their markers", () => {
    expect(
      stripDemoBlocks(
        lines("import a;", "// demo:start", "import demo;", "// demo:end", "", "run(a);"),
      ),
    ).toEqual({ text: lines("import a;", "", "run(a);"), blocks: 1 });
    expect(
      stripDemoBlocks(
        lines("<nav>", "  {/* demo:start */}", "  <Link />", "  {/* demo:end */}", "</nav>"),
      ).text,
    ).toBe(lines("<nav>", "</nav>"));
    expect(
      stripDemoBlocks(
        lines("jobs:", "  verify: {}", "", "  # demo:start", "  demo: {}", "  # demo:end"),
      ).text,
    ).toBe(lines("jobs:", "  verify: {}"));
    expect(
      stripDemoBlocks(
        lines("Intro.", "", "<!-- demo:start -->", "Demo.", "<!-- demo:end -->", "", "Outro."),
      ),
    ).toEqual({ text: lines("Intro.", "", "Outro."), blocks: 1 });
  });

  it("keeps CRLF line endings and leaves files without markers unchanged", () => {
    expect(stripDemoBlocks("a\r\n// demo:start\r\nb\r\n// demo:end\r\nc\r\n").text).toBe(
      "a\r\nc\r\n",
    );
    const plain = lines("const text = '// demo:start inside a string';", "// demo:started");
    expect(stripDemoBlocks(plain)).toEqual({ text: plain, blocks: 0 });
  });

  it.each([
    [lines("// demo:end"), /file:1: demo:end without a matching demo:start/],
    [lines("a", "// demo:start", "b"), /file:2: demo:start without a matching demo:end/],
    [
      lines("// demo:start", "{/* demo:start */}", "// demo:end", "// demo:end"),
      /file:2: demo:start inside the block opened at line 1/,
    ],
  ])("rejects unbalanced or nested markers in %j", (text, message) => {
    expect(() => stripDemoBlocks(text)).toThrow(message);
  });
});

describe("JSON edits", () => {
  it("keep the original layout of objects and arrays that did not change", () => {
    const original = lines(
      "{",
      '  "list": ["a", "b"],',
      '  "tasks": {',
      '    "build": { "outputs": [".next/**"] },',
      '    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] }',
      "  }",
      "}",
    );
    const data = JSON.parse(original);
    expect(`${formatJson(data, original)}\n`).toBe(original);
    data.list = ["a"];
    data.tasks.build.outputs = [];
    expect(`${formatJson(data, original)}\n`).toBe(
      lines(
        "{",
        '  "list": [',
        '    "a"',
        "  ],",
        '  "tasks": {',
        '    "build": {',
        '      "outputs": []',
        "    },",
        '    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] }',
        "  }",
        "}",
      ),
    );
  });
});

describe("demo removal", () => {
  it("performs a dry run without changing any bytes or launching commands", () => {
    const root = fixture();
    const before = snapshot(root);
    const run = vi.fn();
    const plan = removeDemo(root, { "dry-run": true }, run, fixtureLists);
    expect(plan.changes.map(({ file, action }) => `${action} ${file}`)).toEqual([
      "delete src/demo.ts",
      "delete tests/demo",
      "delete scripts/remove-demo.test.mjs",
      "edit src/index.ts",
      "edit README.md",
      "edit package.json",
      "edit turbo.json",
    ]);
    expect(snapshot(root)).toEqual(before);
    expect(run).not.toHaveBeenCalled();
    // The preview ends with what the real run does next, from the same lists.
    expect(console.log.mock.calls.map(([line]) => line).slice(-9)).toEqual([
      "7 path(s) would change.",
      "Then it would run these commands (install updates pnpm-lock.yaml):",
      "  pnpm install --no-frozen-lockfile",
      "  pnpm fix",
      "  pnpm check",
      "  pnpm test",
      "When they pass, it would remove itself:",
      "  delete scripts/remove-demo.mjs",
      '  edit package.json: remove "remove-demo" from scripts',
    ]);
  });

  it("removes the demo, validates in order, removes itself, and then has nothing to do", () => {
    const root = fixture();
    const run = vi.fn((args) => {
      // The command stays available until the checks pass.
      if (args[0] === "install") {
        expect(existsSync(path.join(root, "scripts/remove-demo.mjs"))).toBe(true);
        expect(existsSync(path.join(root, "src/demo.ts"))).toBe(false);
      }
    });
    removeDemo(root, {}, run, fixtureLists);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["fix"],
      ["check"],
      ["test"],
    ]);
    for (const file of ["src/demo.ts", "tests/demo", "scripts/remove-demo.mjs"]) {
      expect(existsSync(path.join(root, file)), file).toBe(false);
    }
    expect(read(root, "src/index.ts")).toBe(
      lines("export const a = 1;", "", "export const b = 2;"),
    );
    expect(read(root, "README.md")).toBe(lines("# Fixture", "", "## Next"));
    expect(JSON.parse(read(root, "package.json"))).toEqual({
      name: "fixture",
      scripts: { build: "next build" },
      dependencies: { next: "1.0.0" },
    });
    expect(JSON.parse(read(root, "turbo.json"))).toEqual({ outputs: [".next/**"] });

    // A second run with uncommitted results finds nothing to remove and changes nothing.
    const before = snapshot(root);
    expect(removeDemo(root, {}, vi.fn(), fixtureLists).changes).toEqual([]);
    expect(snapshot(root)).toEqual(before);
    expect(console.log).toHaveBeenCalledWith("Nothing to remove: the demo is already gone.");
  });

  it("skips only check and test with --skip-checks, says so, and still removes itself", () => {
    const root = fixture();
    const preview = vi.fn();
    removeDemo(root, { "dry-run": true, "skip-checks": true }, preview, fixtureLists);
    expect(preview).not.toHaveBeenCalled();
    expect(console.log.mock.calls.map(([line]) => line).slice(-7)).toEqual([
      "Then it would run these commands (install updates pnpm-lock.yaml):",
      "  pnpm install --no-frozen-lockfile",
      "  pnpm fix",
      "It would skip pnpm check and pnpm test (--skip-checks).",
      "When they pass, it would remove itself:",
      "  delete scripts/remove-demo.mjs",
      '  edit package.json: remove "remove-demo" from scripts',
    ]);
    const run = vi.fn();
    removeDemo(root, { "skip-checks": true }, run, fixtureLists);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["fix"],
    ]);
    for (const file of ["src/demo.ts", "tests/demo", "scripts/remove-demo.mjs"]) {
      expect(existsSync(path.join(root, file)), file).toBe(false);
    }
    expect(JSON.parse(read(root, "package.json")).scripts).toEqual({ build: "next build" });
    expect(console.log).toHaveBeenLastCalledWith(
      "Demo removed. It skipped pnpm check and pnpm test (--skip-checks); run them before you commit.",
    );
  });

  it("deletes the route types from pnpm dev before the checks, even with --skip-checks", () => {
    const root = fixture();
    write(root, ".gitignore", ".next/\n");
    git(root, "add", ".gitignore");
    commit(root, "chore: ignore build output");
    // pnpm dev leaves route types behind that still import the deleted pages.
    const types = "apps/web/.next/dev/types";
    write(root, `${types}/validator.ts`, 'import("../../../src/app/playground/page.js");\n');
    write(root, "apps/web/.next/dev/cache/kept.txt", "kept\n");
    const preview = vi.fn();
    removeDemo(root, { "dry-run": true }, preview, fixtureLists);
    expect(console.log).toHaveBeenCalledWith(`It would delete generated route types ${types}.`);
    expect(existsSync(path.join(root, types))).toBe(true);
    const run = vi.fn((args) => {
      if (args[0] === "install") expect(existsSync(path.join(root, types))).toBe(false);
    });
    removeDemo(root, { "skip-checks": true }, run, fixtureLists);
    expect(run).toHaveBeenCalledTimes(2);
    expect(existsSync(path.join(root, types))).toBe(false);
    expect(read(root, "apps/web/.next/dev/cache/kept.txt")).toBe("kept\n");
  });

  it("refuses to start with uncommitted changes, so the result can be reviewed", () => {
    const root = fixture();
    write(root, "notes.txt", "work in progress\n");
    const before = snapshot(root);
    const run = vi.fn();
    expect(() => removeDemo(root, {}, run, fixtureLists)).toThrow(
      /Commit or stash your changes first[\s\S]*notes\.txt/,
    );
    expect(snapshot(root)).toEqual(before);
    expect(run).not.toHaveBeenCalled();
    // A dry run still works, to preview the result.
    expect(removeDemo(root, { "dry-run": true }, run, fixtureLists).changes).toHaveLength(7);
  });

  it("keeps the changes and the command after a failed check, so the run can be repeated", () => {
    const root = fixture();
    const failing = vi.fn((args) => {
      if (args[0] === "check") throw new Error("Type checking failed");
    });
    expect(() => removeDemo(root, {}, failing, fixtureLists)).toThrow(
      /Type checking failed\nThe demo changes remain for review/,
    );
    expect(existsSync(path.join(root, "src/demo.ts"))).toBe(false);
    expect(existsSync(path.join(root, "scripts/remove-demo.mjs"))).toBe(true);
    // The rerun skips the clean-tree check because only validation and cleanup are left.
    const retry = vi.fn();
    expect(removeDemo(root, {}, retry, fixtureLists).changes).toEqual([]);
    expect(retry).toHaveBeenCalledTimes(4);
    expect(existsSync(path.join(root, "scripts/remove-demo.mjs"))).toBe(false);
    expect(JSON.parse(read(root, "package.json")).scripts).toEqual({ build: "next build" });
  });

  it("stops before writing when a marked file is unbalanced", () => {
    const root = fixture();
    write(root, "README.md", lines("<!-- demo:start -->", "Unclosed."));
    commit(root, "docs: break a marker");
    const before = snapshot(root);
    expect(() => removeDemo(root, {}, vi.fn(), fixtureLists)).toThrow(
      /README\.md:1: demo:start without a matching demo:end/,
    );
    expect(snapshot(root)).toEqual(before);
  });

  it("requires the project root to be a Git root", () => {
    expect(() => planRemoval(temporaryDirectory(), fixtureLists.demo)).toThrow(/requires Git/);
    const root = fixture();
    expect(() => planRemoval(path.join(root, "src"), fixtureLists.demo)).toThrow(/project root/);
  });
});

describe("the template's demo list", () => {
  const listed = (list) => [...list.delete, ...(list.marked ?? [])];

  it("names only paths that exist, so the list cannot go stale", () => {
    for (const file of [...listed(demo), ...listed(tooling)]) {
      expect(existsSync(path.join(repository, file)), file).toBe(true);
    }
  });

  it("applies every JSON edit and every marked block", () => {
    const { changes } = planRemoval(repository);
    const byFile = new Map(changes.map((change) => [change.file, change]));
    for (const file of [...demo.delete, ...demo.marked]) expect(byFile.has(file), file).toBe(true);
    // An edit that finds nothing to change is not reported, so the counts must match.
    for (const [file, edits] of Map.groupBy(demo.json, (edit) => edit.file)) {
      expect(byFile.get(file)?.details, file).toHaveLength(edits.length);
    }
  });

  it("deletes the generated route types that the web tsconfig includes", () => {
    const { include } = JSON.parse(read(repository, "apps/web/tsconfig.json"));
    const typeChecked = include.map((pattern) => `apps/web/${pattern}`);
    for (const directory of generated) {
      expect(typeChecked.some((pattern) => pattern.startsWith(`${directory}/`))).toBe(true);
    }
  });

  it("leaves no Markdown link to a removed file or heading", () => {
    const isDeleted = (file) => demo.delete.some((entry) => `${file}/`.startsWith(`${entry}/`));
    const exists = (file) => existsSync(path.join(repository, file)) && !isDeleted(file);
    const withoutDemo = (file) => stripDemoBlocks(read(repository, file), file).text;
    // GitHub's heading anchors: lowercase, punctuation dropped, spaces become hyphens.
    const anchors = (file) =>
      [...withoutDemo(file).matchAll(/^#+ (.+)$/gm)].map(([, heading]) =>
        heading
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N} _-]/gu, "")
          .replaceAll(" ", "-"),
      );
    const broken = [];
    const documents = git(repository, "ls-files", "-z", "*.md")
      .split("\0")
      .filter((file) => file && !file.startsWith("docs/licenses/") && exists(file));
    for (const file of documents) {
      const text = withoutDemo(file).replace(/```[\s\S]*?```/g, "");
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^[a-z]+:/.test(target)) continue;
        const [relative, anchor] = target.split("#");
        const resolved = relative
          ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative))
          : file;
        if (!exists(resolved)) broken.push(`${file} -> ${target}`);
        else if (anchor && resolved.endsWith(".md") && !anchors(resolved).includes(anchor)) {
          broken.push(`${file} -> ${target}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("has no demo marker outside the listed files", () => {
    const files = git(repository, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
      .split("\0")
      .filter((file) => file && existsSync(path.join(repository, file)));
    const withMarkers = files.filter((file) => {
      const text = readFileSync(path.join(repository, file));
      return !text.includes(0) && text.toString("utf8").split(/\r?\n/).some(markerKind);
    });
    const deleted = demo.delete.map((entry) => entry.replace(/\/?$/, "/"));
    expect(
      withMarkers.filter((file) => !deleted.some((entry) => `${file}/`.startsWith(entry))).sort(),
    ).toEqual([...demo.marked].sort());
  });
});
