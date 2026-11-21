import { type ImageEntity, uploadImageSchema } from "@larder/shared";
import { type Context, Hono, type TypedResponse } from "hono";
import { createMiddleware } from "hono/factory";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
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
  size: "full" | "thumb",
): Promise<Response & TypedResponse<Uint8Array<ArrayBuffer>, 200, "body">> {
  const { data, mime } = await readImage(
    c.var.db,
    c.var.storage,
    c.var.user.id,
    c.req.param("id"),
    size,
  );
  return c.body(new Uint8Array(data), 200, {
    "Content-Type": mime,
  });
}

/** `/api/images`: picture files, for members of the bar they belong to. */
export const imageRoutes = new Hono<AppEnv>()
  .get("/:id", (c) => serve(c, "full"))
  .get("/:id/thumb", (c) => serve(c, "thumb"));
