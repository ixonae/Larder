import type { ImageEntity } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import {
  categories,
  cocktails,
  images,
  pantryIngredients,
  products,
  utensils,
} from "../../db/schema/index.ts";

/** The tables whose rows can hold a picture, by the name used in their URL. */
const owners = {
  categories,
  cocktails,
  products,
  utensils,
  "pantry-ingredients": pantryIngredients,
} as const;

export type StoredImage = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;

/** The item's current `image_id`, or undefined when the item is not in the bar. */
export function findOwnerImage(
  db: Executor,
  entity: ImageEntity,
  barId: string,
  id: string,
): { image_id: string | null } | undefined {
  const table = owners[entity];
  return db
    .select({ image_id: table.image_id })
    .from(table)
    .where(and(eq(table.bar_id, barId), eq(table.id, id)))
    .get();
}

export function setOwnerImage(
  db: Executor,
  entity: ImageEntity,
  barId: string,
  id: string,
  imageId: string | null,
): void {
  const table = owners[entity];
  db.update(table)
    .set({ image_id: imageId })
    .where(and(eq(table.bar_id, barId), eq(table.id, id)))
    .run();
}

export function insertImage(db: Executor, values: NewImage): StoredImage {
  return db.insert(images).values(values).returning().get();
}

export function findImage(db: Executor, barId: string, id: string): StoredImage | undefined {
  return db
    .select()
    .from(images)
    .where(and(eq(images.bar_id, barId), eq(images.id, id)))
    .get();
}

/**
 * The image in whichever bar holds it. Only for `GET /api/images/:id`, which has no bar in its URL:
 * the caller then checks the reader is a member of that bar.
 */
export function findImageInAnyBar(db: Executor, id: string): StoredImage | undefined {
  return db.select().from(images).where(eq(images.id, id)).get();
}

/** A bundled image may still belong to another item in the bar. */
export function imageInUse(db: Executor, barId: string, id: string): boolean {
  return Object.values(owners).some((table) =>
    Boolean(
      db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.bar_id, barId), eq(table.image_id, id)))
        .get(),
    ),
  );
}

export function deleteImage(db: Executor, barId: string, id: string): void {
  db.delete(images)
    .where(and(eq(images.bar_id, barId), eq(images.id, id)))
    .run();
}
