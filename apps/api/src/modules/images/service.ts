import { COCKTAIL_THUMB_MAX_SIDE, type Image, type ImageEntity, newId } from "@larder/shared";
import type { Db, Executor } from "../../db/client.ts";
import { notFound, parseId } from "../../errors.ts";
import { type ImageOptions, type ProcessedImage, processImage } from "../../storage/process.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import { findBarForMember } from "../bars/repo.ts";
import * as repo from "./repo.ts";

const LABEL: Record<ImageEntity, string> = {
  categories: "Category",
  products: "Product",
  utensils: "Utensil",
  cocktails: "Cocktail",
  "pantry-ingredients": "Ingredient",
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
export async function removeImageFiles(
  storage: ImageStorage,
  files: Files | undefined,
): Promise<void> {
  if (!files) return;
  await Promise.allSettled([storage.delete(files.storage_key), storage.delete(files.thumb_key)]);
}

/**
 * Deletes the image row after its last owner stops pointing at it and returns its files for
 * cleanup once the transaction commits.
 */
function dropImage(tx: Executor, barId: string, imageId: string | null): Files | undefined {
  if (imageId === null || repo.imageInUse(tx, barId, imageId)) return undefined;
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
  await removeImageFiles(ctx.storage, files);
}

function requireOwner(db: Executor, entity: ImageEntity, barId: string, id: string) {
  const owner = repo.findOwnerImage(db, entity, barId, id);
  if (!owner) throw notFound(LABEL[entity]);
  return owner;
}

/** Write a prepared full image and thumbnail before inserting their metadata in a transaction. */
export async function stagePreparedImage(
  { barId, userId, storage }: Pick<Ctx, "barId" | "userId" | "storage">,
  processed: ProcessedImage,
) {
  const id = newId();
  const files = {
    storage_key: `${barId}/${id}.webp`,
    thumb_key: `${barId}/${id}-thumb.webp`,
  };
  // Both writes settle before cleanup, so a pending write cannot recreate a deleted file.
  const writes = await Promise.allSettled([
    storage.put(files.storage_key, processed.full),
    storage.put(files.thumb_key, processed.thumb),
  ]);
  const failed = writes.find((write) => write.status === "rejected");
  if (failed) {
    await removeImageFiles(storage, files);
    throw failed.reason;
  }
  return {
    id,
    bar_id: barId,
    created_by: userId,
    ...files,
    mime: "image/webp",
    width: processed.width,
    height: processed.height,
    size_bytes: processed.full.byteLength,
  };
}

/** Process an uploaded picture and stage both resulting files. */
export async function stageImage(
  ctx: Pick<Ctx, "barId" | "userId" | "storage">,
  data: Uint8Array,
  options?: ImageOptions,
) {
  return stagePreparedImage(ctx, await processImage(data, options));
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
  const staged = await stageImage(ctx, new Uint8Array(await file.arrayBuffer()), {
    mime: file.type,
    thumbnailSide: entity === "cocktails" ? COCKTAIL_THUMB_MAX_SIDE : undefined,
  });
  let result: { image: repo.StoredImage; replaced: Files | undefined };
  try {
    result = ctx.db.transaction((tx) => {
      // Checked again: the item may have been deleted while the picture was processed.
      const owner = requireOwner(tx, entity, ctx.barId, ownerId);
      const image = repo.insertImage(tx, staged);
      repo.setOwnerImage(tx, entity, ctx.barId, ownerId, image.id);
      return { image, replaced: dropImage(tx, ctx.barId, owner.image_id) };
    });
  } catch (err) {
    // Whatever was written (one file, both, or none) goes: no row points at it.
    await removeImageFiles(ctx.storage, staged);
    throw err;
  }
  await removeImageFiles(ctx.storage, result.replaced);
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
  await removeImageFiles(ctx.storage, removed);
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
