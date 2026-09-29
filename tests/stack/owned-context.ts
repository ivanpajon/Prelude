import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Only the harness's disposable copy and labelled container may be changed. */
export async function ownedContext() {
  const supplied = process.env.PRELUDE_STACK_CONTEXT;
  const project = process.env.PRELUDE_STACK_PROJECT;
  assert(project, "Missing stack harness project");
  assert(supplied && project.startsWith("prelude-stack-"), "Missing stack harness ownership");
  const root = path.resolve(supplied);
  assert(root.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), "Expected temporary context");
  const owner = await readFile(path.join(root, ".stack-owner"), "utf8");
  assert(project.startsWith(`${owner}-`), "Context and Compose project have different owners");
  return root;
}

export function containerNode(source: string) {
  const container = process.env.PRELUDE_STACK_CONTAINER;
  const project = process.env.PRELUDE_STACK_PROJECT;
  assert(container && /^[a-f0-9]{12,64}$/.test(container), "Missing owned container ID");
  assert(project?.startsWith("prelude-stack-"), "Missing stack harness project");
  const label = execFileSync(
    "docker",
    ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', container],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  assert.equal(label, project, "Refusing to change an unrelated container");
  const node = process.env.PRELUDE_STACK_NODE_BIN;
  assert(node && ["/nodejs/bin/node", "/usr/local/bin/node"].includes(node));
  return execFileSync("docker", ["exec", container, node, "-e", source], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
}
