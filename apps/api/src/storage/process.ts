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

export interface ImageOptions {
  mime?: string;
  thumbnailSide?: number;
}

/** Re-encodes the detail image and a smaller thumbnail to WebP, oriented and without metadata. */
export async function processImage(
  input: Uint8Array,
  { mime, thumbnailSide = THUMB_MAX_SIDE }: ImageOptions = {},
): Promise<ProcessedImage> {
  let format: string | undefined;
  // The declared type covers a HEIC whose header cannot be read; the detected one covers a mislabelled file.
  const unreadable = () => {
    const message =
      mime === "image/heic" || mime === "image/heif" || format === "heif"
        ? "Could not read this HEIC photo. Try a JPEG copy."
        : "Could not read this picture";
    return invalid(message, [{ path: ["file"], message }]);
  };
  // One decoder for the header check and both sizes; each output is a clone of it.
  const source = sharp(input);
  try {
    format = (await source.metadata()).format;
  } catch {
    throw unreadable();
  }
  if (!READABLE.has(format)) throw unreadable();
  const encode = (side: number, quality: number) =>
    source
      .clone()
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  try {
    const [full, thumb] = await Promise.all([
      encode(IMAGE_MAX_SIDE, 82),
      encode(thumbnailSide, 75),
    ]);
    return { full: full.data, thumb: thumb.data, width: full.info.width, height: full.info.height };
  } catch {
    // Some files pass the header check but fail to decode (truncated, or HEIC without an HEVC decoder).
    throw unreadable();
  }
}
