import type { Sharp } from "sharp";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors.ts";
import { processImage } from "./process.ts";

const create = (width: number, height: number): Sharp =>
  sharp({ create: { width, height, channels: 3, background: "#c33" } });

describe("processImage", () => {
  it("re-encodes to WebP within 1600px, with a 256px thumbnail", async () => {
    const out = await processImage(await create(3200, 1600).png().toBuffer());
    expect({ width: out.width, height: out.height }).toEqual({ width: 1600, height: 800 });
    expect(await sharp(out.full).metadata()).toMatchObject({ format: "webp", width: 1600 });
    expect(await sharp(out.thumb).metadata()).toMatchObject({
      format: "webp",
      width: 256,
      height: 128,
    });
    expect(out.thumb.byteLength).toBeLessThan(out.full.byteLength);
  });

  it("never enlarges a small picture", async () => {
    const out = await processImage(await create(120, 80).webp().toBuffer());
    expect({ width: out.width, height: out.height }).toEqual({ width: 120, height: 80 });
    expect(await sharp(out.thumb).metadata()).toMatchObject({ width: 120, height: 80 });
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

  it("suggests a JPEG copy when a HEIF file labelled as another type cannot be decoded", async () => {
    const heif = await create(500, 500).heif({ compression: "av1" }).toBuffer();
    const truncated = heif.subarray(0, heif.length - 50);
    expect((await sharp(truncated).metadata()).format).toBe("heif");
    const err = await processImage(truncated, { mime: "image/jpeg" }).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "VALIDATION",
      message: "Could not read this HEIC photo. Try a JPEG copy.",
    });
  });

  it.each([
    ["not a picture", async (): Promise<Buffer<ArrayBuffer>> => Buffer.from("hello")],
    [
      "a format that is not allowed",
      async (): Promise<Buffer<ArrayBuffer>> => create(10, 10).gif().toBuffer(),
    ],
    [
      "a truncated file",
      async (): Promise<Buffer<ArrayBuffer>> =>
        (await create(500, 500).png().toBuffer()).subarray(0, 200),
    ],
  ])("refuses %s", async (_, input) => {
    const err = await processImage(await input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "VALIDATION", message: "Could not read this picture" });
  });
});
