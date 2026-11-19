import { IMAGE_MAX_SIDE, THUMB_MAX_SIDE } from "@larder/shared";
import sharp from "sharp";
import { invalid } from "../errors.ts";

/** Formats sharp may decode: the ones `IMAGE_MIME_TYPES` names, whatever the browser claimed. */
const READABLE = new Set<string | undefined>(["jpeg", "png", "webp", "heif"]);

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

const unreadable = () =>
  invalid("Could not read this picture", [
    { path: ["file"], message: "Could not read this picture" },
  ]);

/**
 * Re-encodes an upload to WebP at most `IMAGE_MAX_SIDE` pixels, plus a `THUMB_MAX_SIDE` thumbnail.
 * Turned upright from its EXIF orientation first; the output keeps no metadata (sharp's default).
 */
export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  // One decoder for the header check and both sizes; each output is a clone of it.
  const source = sharp(input);
  let format: string | undefined;
  try {
    format = (await source.metadata()).format;
  } catch {
    throw unreadable();
  }
  if (!READABLE.has(format)) throw unreadable();
  const encode = (side: number) =>
    source
      .clone()
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  try {
    const [full, thumb] = await Promise.all([encode(IMAGE_MAX_SIDE), encode(THUMB_MAX_SIDE)]);
    return { full: full.data, thumb: thumb.data, width: full.info.width, height: full.info.height };
  } catch {
    // Some files pass the header check but fail to decode (truncated, or HEIC without an HEVC decoder).
    throw unreadable();
  }
}
