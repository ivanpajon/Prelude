import { spawnSync } from "node:child_process";
import {
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customize, parseOptions, planCustomization } from "./customize.mjs";

const temporaryRoots = [];
const scopes = Object.fromEntries(
  ["fixture", "product", "first", "second", "fresh", "different"].map((name) => [name, `@${name}`]),
);

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "prelude customize "));
  temporaryRoots.push(directory);
  return directory;
}

function write(root, file, content) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof content === "string" ? content : `${JSON.stringify(content)}\n`);
}

function read(root, file) {
  return readFileSync(path.join(root, file), "utf8");
}

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
}

function fixture() {
  const root = temporaryDirectory();
  git(root, "init", "--quiet");
  write(root, ".gitignore", "node_modules/\nignored/\n");
  write(root, "package.json", {
    name: "fixture-project",
    private: true,
    scripts: { start: `pnpm --filter ${scopes.fixture}/web start` },
  });
  write(root, "pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
  write(root, "pnpm-lock.yaml", `lockfileVersion: '9.0'\n# ${scopes.fixture}/ui\n`);
  write(root, "apps/web/package.json", {
    name: `${scopes.fixture}/web`,
    private: true,
    dependencies: { [`${scopes.fixture}/ui`]: "workspace:*", "@vendor/library": "1.0.0" },
  });
  write(root, "packages/ui/package.json", { name: `${scopes.fixture}/ui`, private: true });
  write(root, "apps/web/src/app/layout.tsx", `import "${scopes.fixture}/ui/styles/globals.css";\n`);
  write(
    root,
    "apps/web/next.config.ts",
    `export default { transpilePackages: ["${scopes.fixture}/ui"] };\n`,
  );
  write(root, "apps/web/components.json", { aliases: { ui: `${scopes.fixture}/ui/components` } });
  write(root, "packages/ui/components.json", {
    aliases: { utils: `${scopes.fixture}/ui/lib/utils` },
  });
  write(root, "packages/ui/tsconfig.json", {
    compilerOptions: { paths: { [`${scopes.fixture}/ui/*`]: ["./src/*"] } },
  });
  write(root, "doctor.config.json", {
    projects: [`${scopes.fixture}/web`, `${scopes.fixture}/ui`],
  });
  write(
    root,
    "playwright.config.ts",
    `export const command = "pnpm --filter ${scopes.fixture}/web start";\n`,
  );
  write(
    root,
    "playwright.dev.config.ts",
    `export const command = "pnpm --filter ${scopes.fixture}/web dev";\n`,
  );
  write(root, "README.md", `Import \`${scopes.fixture}/ui/components/button\` in your app.\n`);
  git(root, "add", ".");
  return root;
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
    expect(path.basename(root)).toMatch(/^prelude customize /);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("customization arguments", () => {
  it("accepts independent options and preserves omission", () => {
    expect(parseOptions(["--name", "my-app", "--scope=@acme", "--dry-run"])).toEqual({
      name: "my-app",
      scope: "@acme",
      "dry-run": true,
    });
    expect(parseOptions([])).toEqual({});
    expect(parseOptions(["--help"])).toEqual({ help: true });
  });

  it.each([
    ["--unknown"],
    ["unexpected-position"],
    ["--name"],
    ["--scope"],
    ["--name", ""],
    ["--name", "My-App"],
    ["--name", "with spaces"],
    ["--name", "../outside"],
    ["--name", "@company/app"],
    ["--name", "node_modules"],
    ["--name", "favicon.ico"],
    ["--name", "x".repeat(215)],
    ["--scope", ""],
    ["--scope", "acme"],
    ["--scope", "@Acme"],
    ["--scope", "@acme/ui"],
    ["--scope", "@with spaces"],
  ])("rejects invalid arguments %j", (...args) => {
    expect(() => parseOptions(args)).toThrow();
  });
});

describe("customization planning", () => {
  it("renames only the root package when scope is omitted", () => {
    const root = fixture();
    const before = snapshot(root);
    const plan = planCustomization(root, { name: "new-project" });
    expect(plan.scope).toBe("@fixture");
    expect(plan.changes.map(({ file }) => file)).toEqual(["package.json"]);
    expect(JSON.parse(plan.changes[0].after)).toEqual({
      name: "new-project",
      private: true,
      scripts: { start: `pnpm --filter ${scopes.fixture}/web start` },
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("updates all integration references and leaves the project name and lockfile to their owners", () => {
    const root = fixture();
    const plan = planCustomization(root, { scope: "@product" });
    const changes = new Map(plan.changes.map(({ file, after }) => [file, after]));
    expect(plan.name).toBe("fixture-project");
    expect(JSON.parse(changes.get("apps/web/package.json"))).toEqual({
      name: `${scopes.product}/web`,
      private: true,
      dependencies: { [`${scopes.product}/ui`]: "workspace:*", "@vendor/library": "1.0.0" },
    });
    for (const file of [
      "package.json",
      "packages/ui/package.json",
      "apps/web/src/app/layout.tsx",
      "apps/web/next.config.ts",
      "apps/web/components.json",
      "packages/ui/components.json",
      "packages/ui/tsconfig.json",
      "doctor.config.json",
      "playwright.config.ts",
      "playwright.dev.config.ts",
      "README.md",
    ]) {
      expect(changes.get(file), file).toContain(`${scopes.product}/`);
      expect(changes.get(file), file).not.toContain(`${scopes.fixture}/`);
    }
    expect(changes.has("pnpm-lock.yaml")).toBe(false);
  });

  it("includes untracked source while respecting package boundaries, ignored files, and binary content", () => {
    const root = fixture();
    write(
      root,
      "untracked source.ts",
      [
        `import { Button } from "${scopes.fixture}/ui/components/button";`,
        `const unrelated = ["${scopes.fixture}/ui-kit", "${scopes.fixture}/ui.extra", "${scopes.fixture}/other", "x${scopes.fixture}/ui", "https://host/${scopes.fixture}/ui"];`,
      ].join("\n"),
    );
    write(root, "ignored/file.ts", `import "${scopes.fixture}/ui";\n`);
    write(root, "node_modules/example/index.ts", `import "${scopes.fixture}/ui";\n`);
    write(root, "binary.txt", `${scopes.fixture}/ui\0binary`);
    const changes = new Map(
      planCustomization(root, { scope: "@product" }).changes.map(({ file, after }) => [
        file,
        after,
      ]),
    );
    expect(changes.get("untracked source.ts")).toBe(
      [
        `import { Button } from "${scopes.product}/ui/components/button";`,
        `const unrelated = ["${scopes.fixture}/ui-kit", "${scopes.fixture}/ui.extra", "${scopes.fixture}/other", "x${scopes.fixture}/ui", "https://host/${scopes.fixture}/ui"];`,
      ].join("\n"),
    );
    expect(changes.has("ignored/file.ts")).toBe(false);
    expect(changes.has("node_modules/example/index.ts")).toBe(false);
    expect(changes.has("binary.txt")).toBe(false);
  });

  it("works before an initial commit and with entirely untracked files", () => {
    const root = fixture();
    git(root, "rm", "--cached", "-r", "--quiet", ".");
    const plan = planCustomization(root, { name: "fresh-project", scope: "@fresh" });
    expect(plan.changes.find(({ file }) => file === "package.json").after).toContain(
      "fresh-project",
    );
    expect(plan.changes.find(({ file }) => file === "apps/web/package.json").after).toContain(
      `${scopes.fresh}/web`,
    );
  });

  it("requires the project itself to be a Git root", () => {
    const outside = temporaryDirectory();
    expect(() => planCustomization(outside, { scope: "@product" })).toThrow(/requires Git/);
    const root = fixture();
    expect(() => planCustomization(path.join(root, "apps/web"), { scope: "@product" })).toThrow(
      /project root/,
    );
  });

  it.each(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])(
    "rejects a rename that would overwrite an existing %s entry before writing",
    (group) => {
      const root = fixture();
      const manifest = JSON.parse(read(root, "apps/web/package.json"));
      manifest[group] = { ...manifest[group], [`${scopes.product}/ui`]: "2.0.0" };
      write(root, "apps/web/package.json", manifest);
      const before = snapshot(root);
      expect(() => planCustomization(root, { scope: "@product" })).toThrow(/already exists/);
      expect(snapshot(root)).toEqual(before);
    },
  );

  it("rejects mixed scopes and oversized package names", () => {
    const root = fixture();
    expect(() => planCustomization(root, { scope: `@${"x".repeat(214)}` })).toThrow(/214/);
    write(root, "packages/ui/package.json", { name: `${scopes.different}/ui`, private: true });
    expect(() => planCustomization(root, { scope: "@product" })).toThrow(/share a scope/);
  });

  it("rejects duplicate package names instead of collapsing their rename entries", () => {
    const root = fixture();
    write(root, "packages/duplicate/package.json", { name: `${scopes.fixture}/ui`, private: true });
    expect(() => planCustomization(root, { scope: "@product" })).toThrow(/must be unique/);
  });
});

describe("customization execution", () => {
  it("performs a dry run without changing any bytes or launching child commands", () => {
    const root = fixture();
    const before = snapshot(root);
    const run = vi.fn();
    const plan = customize(root, { name: "new-project", scope: "@product", "dry-run": true }, run);
    expect(plan.changes.length).toBeGreaterThan(1);
    expect(snapshot(root)).toEqual(before);
    expect(run).not.toHaveBeenCalled();
  });

  it("writes the selected names, installs, formats affected files, and validates in order", () => {
    const root = fixture();
    const run = vi.fn((args) => {
      if (args[0] === "install") {
        expect(JSON.parse(read(root, "package.json")).name).toBe("new-project");
        expect(JSON.parse(read(root, "packages/ui/package.json")).name).toBe(
          `${scopes.product}/ui`,
        );
      }
    });
    customize(root, { name: "new-project", scope: "@product" }, run);
    const commands = run.mock.calls.map(([args]) => args);
    expect(commands[0]).toEqual(["install", "--no-frozen-lockfile"]);
    expect(commands[1]).toEqual(
      expect.arrayContaining([
        "exec",
        "biome",
        "check",
        "--write",
        "--linter-enabled=false",
        "package.json",
        "packages/ui/tsconfig.json",
        "playwright.config.ts",
      ]),
    );
    expect(commands[1]).not.toContain("README.md");
    expect(commands.slice(2)).toEqual([["check"], ["test"]]);
  });

  it("supports a second scope rename and reruns without further content changes", () => {
    const root = fixture();
    customize(root, { scope: "@first" }, vi.fn());
    customize(root, { name: "final-project", scope: "@second" }, vi.fn());
    expect(JSON.parse(read(root, "apps/web/package.json")).dependencies).toEqual({
      [`${scopes.second}/ui`]: "workspace:*",
      "@vendor/library": "1.0.0",
    });
    expect(read(root, "apps/web/src/app/layout.tsx")).toContain(
      `${scopes.second}/ui/styles/globals.css`,
    );
    const before = snapshot(root);
    const run = vi.fn();
    const plan = customize(root, { name: "final-project", scope: "@second" }, run);
    expect(plan.changes).toEqual([]);
    expect(snapshot(root)).toEqual(before);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["check"],
      ["test"],
    ]);
  });

  it("stops on a failed install, retains reviewable edits, and can retry the same command", () => {
    const root = fixture();
    const run = vi.fn(() => {
      throw new Error("Installation failed");
    });
    expect(() => customize(root, { name: "new-project", scope: "@product" }, run)).toThrow(
      /Installation failed\nCustomization changes remain for review/,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(JSON.parse(read(root, "package.json")).name).toBe("new-project");
    expect(JSON.parse(read(root, "packages/ui/package.json")).name).toBe(`${scopes.product}/ui`);
    const retry = vi.fn();
    expect(customize(root, { name: "new-project", scope: "@product" }, retry).changes).toEqual([]);
    expect(retry.mock.calls.map(([args]) => args)).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["check"],
      ["test"],
    ]);
  });

  it("reports validation failure and does not run later checks", () => {
    const root = fixture();
    const run = vi.fn((args) => {
      if (args[0] === "check") throw new Error("Type checking failed");
    });
    expect(() => customize(root, { scope: "@product" }, run)).toThrow(/Type checking failed/);
    expect(run.mock.calls.map(([args]) => args[0])).toEqual(["install", "exec", "check"]);
  });
});
