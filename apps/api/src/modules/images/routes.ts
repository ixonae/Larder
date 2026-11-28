import { createHash } from "node:crypto";
import {
  IMAGE_VARIANT_VERSION,
  type ImageEntity,
  type ImageSize,
  imageSizeSchema,
  uploadImageSchema,
} from "@larder/shared";
import { type Context, Hono, type TypedResponse } from "hono";
import { createMiddleware } from "hono/factory";
import { readArtwork } from "../../db/catalogue/artwork.ts";
import { notFound } from "../../errors.ts";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import { IMMUTABLE_CACHE_CONTROL } from "../../static.ts";
import { resizeImage } from "../../storage/process.ts";
import type { AppEnv } from "../../types.ts";
import { readImage, removeImage, uploadImage } from "./service.ts";

const limitUpload = createMiddleware<AppEnv>(async (c, next) => {
  c.var.limitUploads(c.var.ctx.userId);
  await next();
});

/**
 * `PUT` and `DELETE /:id/image` for one kind of item, mounted next to that item's own routes under
 * `/api/bars/:barId/<entity>`. Editors and owners only.
 */
// biome-ignore lint/nursery/useExplicitType: Hono infers the RPC schema from the chained image handlers.
export const entityImageRoutes = (entity: ImageEntity) =>
  new Hono<AppEnv>()
    .put(
      "/:id/image",
      requireRole("editor"),
      limitUpload,
      validate("form", uploadImageSchema),
      async (c) =>
        c.json(await uploadImage(c.var.ctx, entity, c.req.param("id"), c.req.valid("form").file)),
    )
    .delete("/:id/image", requireRole("editor"), async (c) => {
      await removeImage(c.var.ctx, entity, c.req.param("id"));
      return c.body(null, 204);
    });

async function serve(
  c: Context<AppEnv>,
  size: ImageSize,
): Promise<
  | (Response & TypedResponse<Uint8Array<ArrayBuffer>, 200, "body">)
  | (Response & TypedResponse<null, 304, "body">)
> {
  const { data, mime } = await readImage(
    c.var.db,
    c.var.storage,
    c.var.user.id,
    c.req.param("id"),
    size,
  );
  // Match only after session and bar checks, and before spending CPU resizing the picture.
  const hash = createHash("sha256")
    .update(`${IMAGE_VARIANT_VERSION}:${size}:`)
    .update(data)
    .digest("hex");
  const tag = `"${hash}"`;
  const headers = { "Cache-Control": "private, no-cache", Vary: "Cookie", ETag: `W/${tag}` };
  const requestedTag = c.req.header("If-None-Match")?.trim();
  if (requestedTag === "*" || requestedTag?.match(/"[^"]*"/g)?.includes(tag)) {
    return c.body(null, 304, headers);
  }
  const resized = await resizeImage(data, size);
  return c.body(new Uint8Array(resized), 200, { ...headers, "Content-Type": mime });
}

/** `/api/images`: picture files, for members of the bar they belong to. */
export const imageRoutes = new Hono<AppEnv>()
  .get("/:id", (c) => serve(c, "full"))
  .get("/:id/thumb", (c) => serve(c, "thumb"))
  .get("/:id/small", (c) => serve(c, "small"))
  .get("/:id/display", (c) => serve(c, "display"));

/** Public content-hashed URLs resolve exclusively to the built-in artwork registry. */
export const artworkRoutes = new Hono<AppEnv>()
  .get(`/${IMAGE_VARIANT_VERSION}/:key/:file`, async (c) => {
    const file = c.req.param("file");
    if (!file.endsWith(".webp")) throw notFound("Artwork");
    const size = imageSizeSchema.safeParse(file.slice(0, -5));
    if (!size.success) throw notFound("Artwork");
    const data = await readArtwork(c.req.param("key"), size.data);
    if (!data) throw notFound("Artwork");
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": "image/webp",
      "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    });
  })
  .get("*", () => {
    throw notFound("Artwork");
  });
