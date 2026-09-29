import { describe, expect, it, vi } from "vitest";
import { measureUnpackedImageSize } from "./stack-image-size.mjs";

const image = `sha256:${"a".repeat(64)}`;
const container = "b".repeat(64);
const owner = "prelude-stack-measurement-test";

describe("unpacked image measurement", () => {
  it("subtracts the never-started container's writable layer and removes the probe", async () => {
    const docker = vi
      .fn()
      .mockResolvedValueOnce({ output: `${container}\n` })
      .mockResolvedValueOnce({
        output: JSON.stringify([
          {
            Image: image,
            State: { Status: "created" },
            SizeRootFs: 232169472,
            SizeRw: 4096,
          },
        ]),
      })
      .mockResolvedValueOnce({ output: container });
    await expect(measureUnpackedImageSize(image, { docker, owner })).resolves.toEqual({
      rootFsBytes: 232169472,
      writableBytes: 4096,
      unpackedBytes: 232165376,
    });
    expect(docker.mock.calls[0][0]).toEqual([
      "create",
      "--name",
      expect.stringMatching(/^prelude-stack-measurement-test-size-/),
      "--label",
      `dev.prelude.stack.run=${owner}`,
      "--network=none",
      image,
    ]);
    expect(docker).toHaveBeenLastCalledWith(["rm", container], { cleanup: true });
  });

  it("removes its probe even when inspection fails", async () => {
    const docker = vi
      .fn()
      .mockResolvedValueOnce({ output: container })
      .mockRejectedValueOnce(new Error("Inspection failed"))
      .mockResolvedValueOnce({ output: container });
    await expect(measureUnpackedImageSize(image, { docker, owner })).rejects.toThrow(
      "Inspection failed",
    );
    expect(docker).toHaveBeenLastCalledWith(["rm", container], { cleanup: true });
  });

  it("does not remove an unrelated container when creation fails", async () => {
    const docker = vi.fn().mockRejectedValueOnce(new Error("Creation failed"));
    await expect(measureUnpackedImageSize(image, { docker, owner })).rejects.toThrow(
      "Creation failed",
    );
    expect(docker).toHaveBeenCalledTimes(1);
  });
});
