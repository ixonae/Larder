import { type Image, type ImageEntity, newId } from "@larder/shared";
import type { Db, Executor } from "../../db/client.ts";
import { notFound, parseId } from "../../errors.ts";
import { processImage } from "../../storage/process.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import { findBarForMember } from "../bars/repo.ts";
import * as repo from "./repo.ts";

const LABEL: Record<ImageEntity, string> = {
  categories: "Category",
  products: "Product",
  utensils: "Utensil",
};

const toImage = ({ id, mime, width, height, size_bytes, created_at }: repo.StoredImage): Image => ({
  id,
  mime,
  width,
  height,
  size_bytes,
  created_at,
});

type Files = Pick<repo.StoredImage, "storage_key" | "thumb_key">;

/** Best effort: a file left behind wastes space but breaks nothing, so it never fails the request. */
async function removeFiles(storage: ImageStorage, files: Files | undefined): Promise<void> {
  if (!files) return;
  await Promise.allSettled([storage.delete(files.storage_key), storage.delete(files.thumb_key)]);
}

/**
 * Deletes the image row `imageId` (after its owner stopped pointing at it, in the same transaction)
 * and returns its files, to remove once the transaction has committed.
 */
function dropImage(tx: Executor, barId: string, imageId: string | null): Files | undefined {
  if (imageId === null) return undefined;
  const image = repo.findImage(tx, barId, imageId);
  repo.deleteImage(tx, barId, imageId);
  return image;
}

/**
 * Deleting an item that may have a picture: `remove` deletes the item in a transaction and returns
 * the `image_id` it had; the image row goes in the same transaction and its files once committed.
 */
export async function deleteWithImage(
  ctx: Ctx,
  remove: (tx: Executor) => string | null,
): Promise<void> {
  const files = ctx.db.transaction((tx) => dropImage(tx, ctx.barId, remove(tx)));
  await removeFiles(ctx.storage, files);
}

function requireOwner(db: Executor, entity: ImageEntity, barId: string, id: string) {
  const owner = repo.findOwnerImage(db, entity, barId, id);
  if (!owner) throw notFound(LABEL[entity]);
  return owner;
}

/**
 * `PUT /:entity/:id/image`: re-encodes the upload, stores it and its thumbnail, points the item at it
 * and deletes the picture it replaces. The files are written before the database row, so a stored
 * row always has its files; files of a failed upload are removed.
 */
export async function uploadImage(
  ctx: Ctx,
  entity: ImageEntity,
  id: string | undefined,
  file: File,
): Promise<Image> {
  const ownerId = parseId(id, LABEL[entity]);
  requireOwner(ctx.db, entity, ctx.barId, ownerId);
  const processed = await processImage(new Uint8Array(await file.arrayBuffer()));
  const imageId = newId();
  const files = {
    storage_key: `${ctx.barId}/${imageId}.webp`,
    thumb_key: `${ctx.barId}/${imageId}-thumb.webp`,
  };
  let result: { image: repo.StoredImage; replaced: Files | undefined };
  try {
    // Both writes settle before any cleanup, so a file still being written cannot outlive it.
    const writes = await Promise.allSettled([
      ctx.storage.put(files.storage_key, processed.full),
      ctx.storage.put(files.thumb_key, processed.thumb),
    ]);
    const failed = writes.find((w) => w.status === "rejected");
    if (failed) throw failed.reason;
    result = ctx.db.transaction((tx) => {
      // Checked again: the item may have been deleted while the picture was processed.
      const owner = requireOwner(tx, entity, ctx.barId, ownerId);
      const image = repo.insertImage(tx, {
        id: imageId,
        bar_id: ctx.barId,
        created_by: ctx.userId,
        ...files,
        mime: "image/webp",
        width: processed.width,
        height: processed.height,
        size_bytes: processed.full.byteLength,
      });
      repo.setOwnerImage(tx, entity, ctx.barId, ownerId, image.id);
      return { image, replaced: dropImage(tx, ctx.barId, owner.image_id) };
    });
  } catch (err) {
    // Whatever was written (one file, both, or none) goes: no row points at it.
    await removeFiles(ctx.storage, files);
    throw err;
  }
  await removeFiles(ctx.storage, result.replaced);
  return toImage(result.image);
}

/** `DELETE /:entity/:id/image`: the item keeps no picture. Nothing to remove is fine. */
export async function removeImage(
  ctx: Ctx,
  entity: ImageEntity,
  id: string | undefined,
): Promise<void> {
  const ownerId = parseId(id, LABEL[entity]);
  const removed = ctx.db.transaction((tx) => {
    const owner = requireOwner(tx, entity, ctx.barId, ownerId);
    repo.setOwnerImage(tx, entity, ctx.barId, ownerId, null);
    return dropImage(tx, ctx.barId, owner.image_id);
  });
  await removeFiles(ctx.storage, removed);
}

/**
 * `GET /api/images/:id[/thumb]`: the file, for members of the image's bar. Anyone else gets
 * `NOT_FOUND`, so ids of other bars' images reveal nothing.
 */
export async function readImage(
  db: Db,
  storage: ImageStorage,
  userId: string,
  id: string | undefined,
  size: "full" | "thumb",
): Promise<{ data: Buffer; mime: string }> {
  const image = repo.findImageInAnyBar(db, parseId(id, "Image"));
  if (!image || !findBarForMember(db, image.bar_id, userId)?.role) throw notFound("Image");
  const data = await storage.get(size === "full" ? image.storage_key : image.thumb_key);
  if (!data) throw notFound("Image");
  return { data, mime: image.mime };
}
