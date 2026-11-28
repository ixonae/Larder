import { createHash } from "node:crypto";
import type { ImageSize } from "@larder/shared";
import { type ProcessedImage, resizeImage } from "../../storage/process.ts";

const artwork: Map<string, ProcessedImage> = new Map();
const artworkSizes: Set<number> = new Set();
const smallArtwork: Map<string, Promise<Buffer>> = new Map();

/** Both files contribute to the URL so changing either one creates a new cache entry. */
export function artworkKey(full: Buffer, thumb: Buffer): string {
  const fullDigest = createHash("sha256").update(full).digest();
  return createHash("sha256").update(fullDigest).update(thumb).digest("hex");
}

/** Register only files shipped with Larder, during starter catalogue initialization. */
export function registerArtwork(picture: ProcessedImage): ProcessedImage {
  const key = artworkKey(picture.full, picture.thumb);
  artwork.set(key, picture);
  artworkSizes.add(picture.full.byteLength);
  return { ...picture, artworkKey: key };
}

export function bundledArtworkSizes(): number[] {
  return [...artworkSizes];
}

/** Older rows may refer to artwork that has been retired from the current release. */
export function availableArtworkKey(key: string | null): string | null {
  return key !== null && artwork.has(key) ? key : null;
}

export async function readArtwork(key: string, size: ImageSize): Promise<Buffer | undefined> {
  const picture = artwork.get(key);
  if (!picture) return undefined;
  if (size === "thumb") return picture.thumb;
  if (size !== "small") return picture.full;
  // Only registered artwork reaches this cache, and concurrent requests share the pending encode.
  const cached = smallArtwork.get(key);
  if (cached) return cached;
  const pending = resizeImage(picture.thumb, "small").catch((error: unknown) => {
    smallArtwork.delete(key);
    throw error;
  });
  smallArtwork.set(key, pending);
  return pending;
}
