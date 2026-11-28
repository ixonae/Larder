import { z } from "zod";
import { idSchema } from "./id.ts";

/** What an upload may be. Everything is re-encoded to WebP, so this is only what the server reads. */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** The items that can have a picture, as named in their URL (`PUT /:entity/:id/image`). */
export const IMAGE_ENTITIES = [
  "categories",
  "products",
  "utensils",
  "cocktails",
  "pantry-ingredients",
] as const;
export type ImageEntity = (typeof IMAGE_ENTITIES)[number];

/** Longest sides in pixels. Cocktail cards use larger thumbnails than inventory rows. */
export const IMAGE_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 256;
export const COCKTAIL_THUMB_MAX_SIDE = 400;
/** Change the version when the generated variants change. */
export const IMAGE_VARIANT_VERSION = "v1";

export const imageSizeSchema = z.enum(["full", "display", "thumb", "small"]);
export type ImageSize = z.infer<typeof imageSizeSchema>;
export const artworkKeySchema = z.string().regex(/^[a-f0-9]{64}$/);

/** A stored picture. Its file never changes: a replacement is a new image with a new id. */
export const imageSchema = z.object({
  id: idSchema,
  mime: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  size_bytes: z.number().int(),
  created_at: z.string(),
});
export type Image = z.infer<typeof imageSchema>;

/** `PUT /:entity/:id/image` (multipart): one `file` field. */
export const uploadImageSchema = z.object({
  file: z
    .instanceof(File, { message: "Send the picture in a `file` field" })
    .refine((file) => (IMAGE_MIME_TYPES as readonly string[]).includes(file.type), {
      message: "Send a JPEG, PNG, WebP or HEIC picture",
    }),
});

/** Bundled art is served under content-hashed URLs. Other pictures require authorization. */
export const imageUrl = (
  id: string,
  size: ImageSize = "full",
  artworkKey?: string | null,
): string => {
  if (artworkKey) return `/artwork/${IMAGE_VARIANT_VERSION}/${artworkKey}/${size}.webp`;
  return size === "full" ? `/api/images/${id}` : `/api/images/${id}/${size}`;
};
