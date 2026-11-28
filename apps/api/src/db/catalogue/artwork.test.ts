import sharp from "sharp";
import { expect, it, vi } from "vitest";
import * as process from "../../storage/process.ts";
import { readArtwork, registerArtwork } from "./artwork.ts";

it("shares concurrent thumbnail encodes, reuses the output and retries after a failure", async () => {
  const picture = await sharp({
    create: { width: 256, height: 256, channels: 3, background: "#369" },
  })
    .webp()
    .toBuffer();
  const { artworkKey } = registerArtwork({
    full: picture,
    thumb: picture,
    width: 256,
    height: 256,
  });
  if (!artworkKey) throw new Error("Expected an artwork key");
  const size = vi.spyOn(process, "resizeImage").mockRejectedValueOnce(new Error("Temporary error"));
  try {
    await expect(readArtwork(artworkKey, "small")).rejects.toThrow("Temporary error");
    const [first, concurrent] = await Promise.all([
      readArtwork(artworkKey, "small"),
      readArtwork(artworkKey, "small"),
    ]);
    expect(first).toBe(concurrent);
    expect(await readArtwork(artworkKey, "small")).toBe(first);
    expect(size).toHaveBeenCalledTimes(2);
  } finally {
    size.mockRestore();
  }
});
