import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const help = `Customize the project name and private workspace scope.

  pnpm customize --name my-app --scope "@acme"
  pnpm customize --name my-app
  pnpm customize --scope "@acme" --dry-run

Omitted options preserve the current name or scope (@repo in a fresh template).
Run from a Git checkout with Node and the pinned pnpm version available.
Stops on errors; does not commit changes or rename application branding.

Options:
  --name <name>    Unscoped, lowercase root package name
  --scope <scope>  Lowercase workspace scope, including @
  --dry-run       List changes without writing files or running checks
  --help          Show this help
`;

export function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: "string" },
      scope: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (
    values.name !== undefined &&
    (!/^[a-z0-9][a-z0-9._-]*$/.test(values.name) ||
      values.name.length > 214 ||
      ["node_modules", "favicon.ico"].includes(values.name))
  ) {
    throw new Error("--name must be an unscoped lowercase package name (for example, my-app).");
  }
  if (values.scope !== undefined && !/^@[a-z0-9][a-z0-9._-]*$/.test(values.scope)) {
    throw new Error("--scope must be a lowercase npm scope including @ (for example, @acme).");
  }
  return values;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("Customization requires Git and a Git checkout. Initialize one with git init.");
  }
  return result.stdout;
}

function regularFile(root, relative) {
  const absolute = path.resolve(root, relative);
  // Skip deleted files and symbolic links, including links in parent directories.
  try {
    const resolved = realpathSync.native(absolute);
    const fromRoot = path.relative(root, resolved);
    return (
      !fromRoot.startsWith(`..${path.sep}`) &&
      fromRoot !== ".." &&
      !path.isAbsolute(fromRoot) &&
      resolved === absolute &&
      lstatSync(absolute).isFile()
    );
  } catch {
    return false;
  }
}

export function planCustomization(directory, options) {
  const root = realpathSync.native(directory);
  if (realpathSync.native(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root) {
    throw new Error("Initialize Git in this project root before customizing it.");
  }
  const files = [
    ...new Set(
      git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0"),
    ),
  ]
    .filter((file) => file && regularFile(root, file))
    .sort();
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const manifest = JSON.parse(read("package.json"));
  // These are the package boundaries declared in pnpm-workspace.yaml.
  const workspaceFiles = files.filter((file) =>
    /^(apps|packages)\/[^/]+\/package\.json$/.test(file),
  );
  const workspaces = workspaceFiles.map((file) => JSON.parse(read(file)));
  if (
    workspaces.length === 0 ||
    workspaces.some((workspace) => !workspace.private || !/^@[^/]+\/[^/]+$/.test(workspace.name))
  ) {
    throw new Error("Expected private, scoped workspace packages under apps/* and packages/*.");
  }
  const scopes = new Set(workspaces.map((workspace) => workspace.name.split("/")[0]));
  if (scopes.size !== 1)
    throw new Error("All workspace packages must share a scope before customizing.");
  const currentScope = [...scopes][0];
  const scope = options.scope ?? currentScope;
  const name = options.name ?? manifest.name;
  const replacements = new Map(
    workspaces.map((workspace) => [workspace.name, `${scope}/${workspace.name.split("/")[1]}`]),
  );
  const targets = [...replacements.values()];
  if (
    targets.some((target) => target.length > 214) ||
    new Set(targets).size !== workspaces.length
  ) {
    throw new Error("Workspace names must be unique and at most 214 characters long.");
  }
  for (const pkg of [manifest, ...workspaces]) {
    for (const group of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const [before, after] of replacements) {
        if (before !== after && Object.hasOwn(pkg[group] ?? {}, after)) {
          throw new Error(
            `Cannot rename ${before}: ${after} already exists in ${pkg.name} ${group}.`,
          );
        }
      }
    }
  }

  const pattern = new RegExp(
    `(?<![a-zA-Z0-9@._/-])(?:${[...replacements.keys()].map(RegExp.escape).join("|")})(?![a-zA-Z0-9._-])`,
    "g",
  );
  const changes = [];
  for (const file of files) {
    // pnpm owns its lockfile. Limit edits to source, configuration, and documentation.
    if (
      file === "pnpm-lock.yaml" ||
      !/\.(?:[cm]?[jt]sx?|jsonc?|css|mdx?|ya?ml|html|txt|toml|sh|ps1)$/.test(file)
    )
      continue;
    const before = read(file);
    if (before.includes("\0")) continue;
    let after = before.replace(pattern, (match) => replacements.get(match));
    if (file === "package.json" && name !== manifest.name) {
      const updated = JSON.parse(after);
      updated.name = name;
      after = `${JSON.stringify(updated, null, 2)}\n`;
      if (before.includes("\r\n")) after = after.replaceAll("\n", "\r\n");
    }
    if (after !== before) changes.push({ file, before, after });
  }
  return { root, name, scope, changes };
}

function pnpmRunner(root) {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: pnpm supplies its executable path to package scripts.
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error("Run this command with pnpm customize.");
  const isScript = /\.[cm]?js$/.test(executable);
  return (args) => {
    const result = spawnSync(
      isScript ? process.execPath : executable,
      isScript ? [executable, ...args] : args,
      {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `pnpm ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : "."}`,
      );
    }
  };
}

export function customize(directory, options, run) {
  const plan = planCustomization(directory, options);
  console.log(`Project: ${plan.name}\nWorkspace scope: ${plan.scope}`);
  for (const { file } of plan.changes) console.log(`  ${file}`);
  console.log(
    `${plan.changes.length} file(s) ${options["dry-run"] ? "would change" : "to update"}.`,
  );
  if (options["dry-run"]) return plan;
  const execute = run ?? pnpmRunner(plan.root);
  for (const { file, after } of plan.changes) writeFileSync(path.join(plan.root, file), after);
  try {
    // Reinstall even on a rerun: a previous attempt may have stopped during installation.
    execute(["install", "--no-frozen-lockfile"]);
    const formattable = plan.changes
      .map(({ file }) => file)
      .filter((file) => /\.(?:[cm]?[jt]sx?|jsonc?|css)$/.test(file));
    if (formattable.length > 0) {
      execute(["exec", "biome", "check", "--write", "--linter-enabled=false", ...formattable]);
    }
    execute(["check"]);
    execute(["test"]);
  } catch (error) {
    throw new Error(
      `${error.message}\nCustomization changes remain for review. Fix the reported error and rerun the same command to finish installation and validation.`,
      { cause: error },
    );
  }
  console.log("Customization verified. Review the diff and commit when ready.");
  return plan;
}

if (import.meta.main) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help || (options.name === undefined && options.scope === undefined)) {
      console.log(help);
    } else {
      customize(fileURLToPath(new URL("../", import.meta.url)), options);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
