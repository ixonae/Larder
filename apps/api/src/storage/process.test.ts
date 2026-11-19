import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors.ts";
import { processImage } from "./process.ts";

const create = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#c33" } });

describe("processImage", () => {
  it("re-encodes to WebP within 1600px, with a 400px thumbnail", async () => {
    const out = await processImage(await create(3200, 1600).png().toBuffer());
    expect({ width: out.width, height: out.height }).toEqual({ width: 1600, height: 800 });
    expect(await sharp(out.full).metadata()).toMatchObject({ format: "webp", width: 1600 });
    expect(await sharp(out.thumb).metadata()).toMatchObject({ width: 400, height: 200 });
  });

  it("never enlarges a small picture", async () => {
    const out = await processImage(await create(120, 80).webp().toBuffer());
    expect({ width: out.width, height: out.height }).toEqual({ width: 120, height: 80 });
  });

  it("turns the picture upright and strips its metadata", async () => {
    const jpeg = await create(200, 100)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "Someone" } } })
      .toBuffer();
    const out = await processImage(jpeg);
    expect({ width: out.width, height: out.height }).toEqual({ width: 100, height: 200 });
    const meta = await sharp(out.full).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("reads HEIF", async () => {
    const heif = await create(64, 64).heif({ compression: "av1" }).toBuffer();
    expect((await processImage(heif)).width).toBe(64);
  });

  it.each([
    ["not a picture", async () => Buffer.from("hello")],
    ["a format that is not allowed", async () => create(10, 10).gif().toBuffer()],
    ["a truncated file", async () => (await create(500, 500).png().toBuffer()).subarray(0, 200)],
  ])("refuses %s", async (_, input) => {
    const err = await processImage(await input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "VALIDATION", message: "Could not read this picture" });
  });
});
