import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Image inspect Size includes packed content on containerd; measure snapshots instead. */
export async function measureUnpackedImageSize(imageId, { docker, owner }) {
  assert(/^sha256:[a-f0-9]{64}$/.test(imageId), "Expected an immutable Docker image ID");
  assert(/^prelude-stack-[a-z0-9-]+$/.test(owner), "Expected an isolated stack owner");
  const name = `${owner}-size-${randomUUID().slice(0, 8)}`;
  let container;
  try {
    container = (
      await docker([
        "create",
        "--name",
        name,
        "--label",
        `dev.prelude.stack.run=${owner}`,
        "--network=none",
        imageId,
      ])
    ).output.trim();
    assert(/^[a-f0-9]{12,64}$/.test(container), "Expected an owned measurement container ID");
    const inspected = JSON.parse(
      (await docker(["container", "inspect", "--size", container])).output,
    )[0];
    assert.equal(inspected.Image, imageId, "Measurement container uses a different image");
    assert.equal(inspected.State.Status, "created", "Measurement container must never start");
    const rootFsBytes = inspected.SizeRootFs;
    const writableBytes = inspected.SizeRw;
    assert(Number.isSafeInteger(rootFsBytes) && rootFsBytes > 0, "Invalid root filesystem size");
    assert(Number.isSafeInteger(writableBytes) && writableBytes >= 0, "Invalid writable size");
    assert(rootFsBytes > writableBytes, "Expected a nonempty read-only image filesystem");
    return { rootFsBytes, writableBytes, unpackedBytes: rootFsBytes - writableBytes };
  } finally {
    if (container && /^[a-f0-9]{12,64}$/.test(container)) {
      await docker(["rm", container], { cleanup: true });
    }
  }
}
