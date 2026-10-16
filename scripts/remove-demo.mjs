import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const help = `Remove the task demo and keep the infrastructure.

  pnpm remove-demo --dry-run
  pnpm remove-demo

Stop pnpm dev first. Run from the project root, in a Git checkout without
uncommitted changes, so you can review the result with git diff. The command
deletes the demo and the route types that pnpm dev generated, then
reinstalls, formats, checks and tests the project. When the checks pass, it
also removes itself. It does not commit.

Options:
  --dry-run      List changes without writing files or running checks
  --skip-checks  Reinstall and format, but skip pnpm check and pnpm test;
                 run them yourself afterwards
  --help         Show this help
`;

const messages = "packages/i18n/src/messages";
// Every language folder, so the demo text also goes from languages added after the template.
const languages = readdirSync(fileURLToPath(new URL(`../${messages}`, import.meta.url)), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/**
 * Everything the demo owns. Shared files mark demo-only lines between a `demo:start` and a
 * `demo:end` comment, each on its own line: a line comment in code, a JSX comment, a YAML
 * comment, or an HTML comment in Markdown (see `markerLines`).
 */
export const demo = {
  // Files and folders that only the demo uses.
  delete: [
    "apps/web/src/app/[routingMode]/[locale]/playground",
    "apps/web/src/app/actions/mcp-playground.ts",
    "apps/web/src/components/mcp-playground.test.tsx",
    "apps/web/src/components/mcp-playground.tsx",
    "apps/web/src/components/task-workbench-server.tsx",
    "apps/web/src/components/task-workbench.test.tsx",
    "apps/web/src/components/task-workbench.tsx",
    "apps/web/src/components/workbench-store-provider.tsx",
    "apps/web/src/lib/api-errors.tasks.test.ts",
    "apps/web/src/lib/mcp-app-resource.test.ts",
    "apps/web/src/lib/mcp-app-resource.ts",
    "apps/web/src/lib/mcp-playground-format.test.ts",
    "apps/web/src/lib/mcp-playground-format.ts",
    "apps/web/src/lib/mcp-playground-types.ts",
    "apps/web/src/lib/mcp-playground.test.ts",
    "apps/web/src/lib/mcp-playground.ts",
    "apps/web/src/lib/mcp.tasks.test.ts",
    "apps/web/src/lib/openapi.tasks.test.ts",
    "apps/web/src/lib/task-search.test.ts",
    "apps/web/src/lib/task-search.ts",
    "apps/web/src/mcp-apps",
    "apps/web/src/stores/mcp-playground-store.test.ts",
    "apps/web/src/stores/mcp-playground-store.ts",
    "apps/web/src/stores/workbench-store.test.ts",
    "apps/web/src/stores/workbench-store.ts",
    "docs/mcp-apps.md",
    "docs/remove-demo.md",
    "packages/api/src/contract-types.ts",
    "packages/api/src/repository.ts",
    "packages/api/src/tasks.test.ts",
    "packages/api/src/tasks.ts",
    "packages/contracts/src/limits.ts",
    "packages/contracts/src/tasks.ts",
    ...languages.flatMap((language) =>
      ["mcp", "tasks", "widget"].map((name) => `${messages}/${language}/${name}.json`),
    ),
    "packages/i18n/src/widget.ts",
    "scripts/build-mcp-apps.mjs",
    "scripts/build-mcp-apps.test.mjs",
    "scripts/remove-demo.test.mjs",
    "tests/demo",
    "tests/dev/demo",
    "tests/e2e/demo",
    "tests/stack/demo",
  ],
  // Shared files with demo-only blocks.
  marked: [
    ".github/workflows/ci.yml",
    ".github/workflows/docker.yml",
    "AGENTS.md",
    "README.md",
    "apps/web/next.config.ts",
    "apps/web/src/app/[routingMode]/[locale]/layout.tsx",
    "apps/web/src/app/[routingMode]/[locale]/page.tsx",
    "apps/web/src/components/site-header.tsx",
    "apps/web/src/i18n/types.d.ts",
    "apps/web/src/lib/mcp.ts",
    "apps/web/src/lib/openapi.ts",
    "apps/web/src/lib/request-context.ts",
    "compose.dev.yaml",
    "docs/architecture.md",
    "docs/diagnostics.md",
    "docs/docker.md",
    "docs/i18n.md",
    "docs/mcp.md",
    "docs/motion.md",
    "docs/openapi.md",
    "docs/requirements.md",
    "docs/verification.md",
    "packages/api/src/index.ts",
    "packages/api/src/router.ts",
    "packages/contracts/src/index.ts",
    "packages/i18n/src/index.test.ts",
    "packages/i18n/src/messages.ts",
    "playwright.config.ts",
    "playwright.dev.config.ts",
    "playwright.stack.config.ts",
    "scripts/dev-web.mjs",
    "scripts/dev-web.test.mjs",
    "scripts/docker-workflow.test.mjs",
    "scripts/test-stack.mjs",
    "scripts/verify-build-cache.mjs",
    "tests/e2e/mcp.spec.ts",
  ],
  // JSON values that only the demo uses. A path lists the keys from the root.
  json: [
    ...languages.flatMap((language) =>
      [["Common", "playground"], ["Home", "openPlayground"], ["Playground"]].map((key) => ({
        file: `${messages}/${language}/site.json`,
        delete: key,
      })),
    ),
    { file: "packages/i18n/package.json", delete: ["exports", "./widget"] },
    { file: "packages/contracts/package.json", delete: ["exports", "./limits"] },
    { file: "apps/web/package.json", delete: ["dependencies", "@modelcontextprotocol/core"] },
    { file: "apps/web/package.json", delete: ["dependencies", "@modelcontextprotocol/ext-apps"] },
    { file: "apps/web/package.json", delete: ["dependencies", "use-intl"] },
    { file: "apps/web/package.json", delete: ["devDependencies", "@tailwindcss/cli"] },
    { file: "apps/web/package.json", delete: ["devDependencies", "tsdown"] },
    {
      file: "apps/web/package.json",
      set: ["scripts", "build"],
      to: "next build --turbopack && serwist build",
    },
    { file: "turbo.json", pull: ["globalDependencies"], item: "scripts/build-mcp-apps.mjs" },
    { file: "turbo.json", pull: ["tasks", "build", "outputs"], item: ".generated/mcp-apps/**" },
  ],
};

/**
 * Route types that `next dev` generated. They still name the deleted pages, and the web tsconfig
 * includes them, so pnpm check would fail on them. `next dev` writes them again at startup.
 */
export const generated = ["apps/web/.next/dev/types"];

/** The pnpm commands that run after the demo changes, in order. Install updates pnpm-lock.yaml. */
export const commands = [["install", "--no-frozen-lockfile"], ["fix"], ["check"], ["test"]];

/** The commands that --skip-checks leaves out, for CI jobs that run them in another job. */
const checks = ["check", "test"];

/** This command itself. It is removed last, after the checks pass, so a failed run can be repeated. */
export const tooling = {
  delete: ["scripts/remove-demo.mjs"],
  json: [{ file: "package.json", delete: ["scripts", "remove-demo"] }],
};

const markerLines = new Map(
  ["start", "end"].flatMap((kind) =>
    [`// demo:${kind}`, `{/* demo:${kind} */}`, `# demo:${kind}`, `<!-- demo:${kind} -->`].map(
      (line) => [line, kind],
    ),
  ),
);

/** Returns "start" or "end" for a demo marker line, otherwise undefined. */
export function markerKind(line) {
  return markerLines.get(line.trim());
}

/** Deletes every demo block, markers included. Keeps the file's line endings. */
export function stripDemoBlocks(text, file = "file") {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const kept = [];
  let start;
  let blocks = 0;
  for (let index = 0; index < lines.length; index++) {
    const kind = markerKind(lines[index]);
    if (kind === "start") {
      if (start !== undefined) {
        throw new Error(
          `${file}:${index + 1}: demo:start inside the block opened at line ${start + 1}. Demo blocks cannot be nested.`,
        );
      }
      start = index;
    } else if (kind === "end") {
      if (start === undefined) {
        throw new Error(`${file}:${index + 1}: demo:end without a matching demo:start.`);
      }
      start = undefined;
      blocks++;
      // Keep one blank line, not two, where a block sat between blank lines.
      if (kept.at(-1)?.trim() === "" && lines[index + 1]?.trim() === "") index++;
    } else if (start === undefined) {
      kept.push(lines[index]);
    }
  }
  if (start !== undefined) {
    throw new Error(`${file}:${start + 1}: demo:start without a matching demo:end.`);
  }
  return { text: kept.join(eol), blocks };
}

function describeEdit(edit) {
  const key = edit.set ?? edit.pull ?? edit.delete;
  if (edit.set) return `set ${key.join(".")}`;
  if (edit.pull) return `remove "${edit.item}" from ${key.join(".")}`;
  const parent = key.slice(0, -1).join(".");
  return `remove "${key.at(-1)}"${parent ? ` from ${parent}` : ""}`;
}

/** Applies one JSON edit in place. Returns false when there is nothing left to change. */
function applyJsonEdit(data, edit) {
  const key = edit.set ?? edit.pull ?? edit.delete;
  const parent = key.slice(0, -1).reduce((value, name) => value?.[name], data);
  const name = key.at(-1);
  if (parent === null || typeof parent !== "object") return false;
  if (edit.set) {
    if (parent[name] === edit.to) return false;
    parent[name] = edit.to;
  } else if (edit.pull) {
    const list = parent[name];
    if (!Array.isArray(list) || !list.includes(edit.item)) return false;
    parent[name] = list.filter((item) => item !== edit.item);
  } else {
    if (!Object.hasOwn(parent, name)) return false;
    delete parent[name];
  }
  return true;
}

/** Formats JSON like Biome, keeping objects and arrays on one line where the original did. */
export function formatJson(value, original, indent = "") {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const isArray = Array.isArray(value);
  const items = isArray
    ? value.map((item) => formatJson(item, original, `${indent}  `))
    : Object.entries(value).map(
        ([key, item]) => `${JSON.stringify(key)}: ${formatJson(item, original, `${indent}  `)}`,
      );
  if (items.length === 0) return isArray ? "[]" : "{}";
  const inline = isArray ? `[${items.join(", ")}]` : `{ ${items.join(", ")} }`;
  if (!inline.includes("\n") && original.includes(inline)) return inline;
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  return `${open}\n${items.map((item) => `${indent}  ${item}`).join(",\n")}\n${indent}${close}`;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Removing the demo requires Git and a Git checkout. Initialize one with git init.",
    );
  }
  return result.stdout;
}

function planFiles(root, list) {
  const changes = [];
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  for (const file of list.delete ?? []) {
    if (existsSync(path.join(root, file))) changes.push({ file, action: "delete" });
  }
  for (const file of list.marked ?? []) {
    if (!existsSync(path.join(root, file))) continue;
    const before = read(file);
    const { text, blocks } = stripDemoBlocks(before, file);
    if (blocks > 0)
      changes.push({ file, action: "edit", after: text, details: [`${blocks} block(s)`] });
  }
  const edits = Map.groupBy(list.json ?? [], (edit) => edit.file);
  for (const [file, fileEdits] of edits) {
    if (!existsSync(path.join(root, file))) continue;
    const before = read(file);
    const data = JSON.parse(before);
    const details = fileEdits.filter((edit) => applyJsonEdit(data, edit)).map(describeEdit);
    if (details.length === 0) continue;
    let after = `${formatJson(data, before)}\n`;
    if (before.includes("\r\n")) after = after.replaceAll("\n", "\r\n");
    changes.push({ file, action: "edit", after, details });
  }
  return changes;
}

function applyChanges(root, changes) {
  for (const { file, action, after } of changes) {
    const target = path.join(root, file);
    if (action === "delete") rmSync(target, { recursive: true, force: true });
    else writeFileSync(target, after);
  }
}

/** Lists the demo changes without writing anything. Fails on unbalanced or nested markers. */
export function planRemoval(directory, list = demo) {
  const root = realpathSync.native(directory);
  if (realpathSync.native(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root) {
    throw new Error("Initialize Git in this project root before removing the demo.");
  }
  return { root, changes: planFiles(root, list) };
}

function pnpmRunner(root) {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: pnpm supplies its executable path to package scripts.
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error("Run this command with pnpm remove-demo.");
  const isScript = /\.[cm]?js$/.test(executable);
  return (args) => {
    const result = spawnSync(
      isScript ? process.execPath : executable,
      isScript ? [executable, ...args] : args,
      { cwd: root, stdio: "inherit", env: process.env },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `pnpm ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : "."}`,
      );
    }
  };
}

function printChanges(changes) {
  for (const { file, action, details } of changes) {
    console.log(`  ${action} ${file}${details ? `: ${details.join(", ")}` : ""}`);
  }
}

export function removeDemo(directory, options = {}, run, lists = { demo, tooling, generated }) {
  const skipChecks = options["skip-checks"] === true;
  const steps = skipChecks ? commands.filter(([name]) => !checks.includes(name)) : commands;
  const skipped = `pnpm ${checks.join(" and pnpm ")}`;
  const plan = planRemoval(directory, lists.demo);
  printChanges(plan.changes);
  if (plan.changes.length === 0) {
    console.log("Nothing to remove: the demo is already gone.");
  } else {
    console.log(
      `${plan.changes.length} path(s) ${options["dry-run"] ? "would change" : "to change"}.`,
    );
  }
  // Ignored by Git, so they are neither listed as changes nor part of the clean-tree check.
  const stale = (lists.generated ?? []).filter((file) => existsSync(path.join(plan.root, file)));
  if (options["dry-run"]) {
    for (const file of stale) console.log(`It would delete generated route types ${file}.`);
    console.log("Then it would run these commands (install updates pnpm-lock.yaml):");
    for (const args of steps) console.log(`  pnpm ${args.join(" ")}`);
    if (skipChecks) console.log(`It would skip ${skipped} (--skip-checks).`);
    console.log("When they pass, it would remove itself:");
    printChanges(planFiles(plan.root, lists.tooling));
    return plan;
  }
  if (plan.changes.length > 0) {
    // A clean start keeps the review simple: git diff then shows only this command's changes.
    const pending = git(plan.root, ["status", "--porcelain", "--untracked-files=all"]);
    if (pending.trim()) {
      throw new Error(
        `Commit or stash your changes first, so you can review what remove-demo changes:\n${pending.trimEnd()}`,
      );
    }
  }
  const execute = run ?? pnpmRunner(plan.root);
  applyChanges(plan.root, plan.changes);
  for (const file of stale) {
    console.log(`Deleting generated route types ${file}; pnpm dev writes them again.`);
    rmSync(path.join(plan.root, file), { recursive: true, force: true });
  }
  try {
    // Reinstall even on a rerun: a previous attempt may have stopped during installation.
    for (const args of steps) execute(args);
  } catch (error) {
    throw new Error(
      `${error.message}\nThe demo changes remain for review. Fix the reported error and run pnpm remove-demo again to finish.`,
      { cause: error },
    );
  }
  applyChanges(plan.root, planFiles(plan.root, lists.tooling));
  if (skipChecks) {
    console.log(`Demo removed. It skipped ${skipped} (--skip-checks); run them before you commit.`);
    return plan;
  }
  console.log(`Demo removed, and the checks pass. Next steps:
  1. Review the changes with git status and git diff.
  2. Commit them with git add -A and git commit -m "chore: remove the demo".
  3. Add your first procedure: see "Add or change a procedure" in docs/openapi.md.
  4. Run pnpm verify for the production build and browser tests.`);
  return plan;
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      options: {
        "dry-run": { type: "boolean" },
        "skip-checks": { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: false,
    });
    if (values.help) console.log(help);
    else removeDemo(fileURLToPath(new URL("../", import.meta.url)), values);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
