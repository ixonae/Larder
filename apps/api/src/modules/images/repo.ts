import type { ImageEntity } from "@larder/shared";
import { and, eq, getTableName, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
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

/** Select the public key for the owning row, when the current release still ships the picture. */
export function selectArtworkKey(table: SQLiteTable): SQL<string | null> {
  // Explicit qualifiers also work in SQLite RETURNING and single-table Drizzle SELECTs.
  const owner = sql.identifier(getTableName(table));
  return sql<string | null>`(select larder_artwork_key(images.artwork_key) from images
    where images.id = ${owner}.image_id and images.bar_id = ${owner}.bar_id)`;
}

export function legacyArtworkCandidates(
  db: Executor,
  barId: string,
  sizes: number[],
): StoredImage[] {
  return db
    .select()
    .from(images)
    .where(
      and(eq(images.bar_id, barId), isNull(images.artwork_key), inArray(images.size_bytes, sizes)),
    )
    .all();
}

export function setArtworkKey(db: Executor, barId: string, id: string, key: string): void {
  db.update(images)
    .set({ artwork_key: key })
    .where(and(eq(images.bar_id, barId), eq(images.id, id), isNull(images.artwork_key)))
    .run();
}

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
