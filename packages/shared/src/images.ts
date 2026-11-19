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
export const IMAGE_ENTITIES = ["categories", "products", "utensils"] as const;
export type ImageEntity = (typeof IMAGE_ENTITIES)[number];

/** Longest side of the stored picture and of its thumbnail, in pixels. */
export const IMAGE_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;

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

/** Where the browser loads an image from (`GET /api/images/:id[/thumb]`). */
export const imageUrl = (id: string, size: "full" | "thumb" = "full") =>
  size === "thumb" ? `/api/images/${id}/thumb` : `/api/images/${id}`;
