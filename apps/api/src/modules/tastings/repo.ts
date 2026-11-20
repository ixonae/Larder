import { nowIso, type Visibility } from "@larder/shared";
import { and, desc, eq, gte, inArray, lte, ne, not, sql } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { beforeKey, type NameCursor, newestFirst } from "../../db/cursor.ts";
import { categories, products, tastings, users } from "../../db/schema/index.ts";
import { visibleFeedback } from "../../db/visibility.ts";

/**
 * Whether the tasting's author can still write in its bar (an editor or owner there). Written with
 * qualified names: drizzle drops them in single-table statements, which would break the correlation.
 */
const authorCanWrite =
  sql<boolean>`exists (select 1 from bar_members m where m.bar_id = tastings.bar_id and m.user_id = tastings.created_by and m.role in ('editor', 'owner'))`.mapWith(
    Boolean,
  );

const columns = {
  id: tastings.id,
  product_id: tastings.product_id,
  tasted_on: tastings.tasted_on,
  score: tastings.score,
  notes: tastings.notes,
  location: tastings.location,
  is_private: tastings.is_private,
  created_by: tastings.created_by,
  display_name: users.display_name,
  created_at: tastings.created_at,
  updated_at: tastings.updated_at,
  product_name: products.name,
  product_image_id: products.image_id,
  product_status: products.status,
  category_id: products.category_id,
  category_name: categories.name,
  author_can_write: authorCanWrite,
};

export type TastingRow = NonNullable<ReturnType<typeof findTasting>>;

export type NewTasting = typeof tastings.$inferInsert;
export type TastingChanges = Partial<
  Pick<NewTasting, "tasted_on" | "score" | "notes" | "location" | "is_private">
>;

export interface TastingFilter {
  productId?: string;
  /** Bottles in any of these categories. */
  categoryIds?: string[];
  scoreMin?: number;
  scoreMax?: number;
  from?: string;
  to?: string;
  createdBy?: string;
  visibility?: Visibility;
  after?: NameCursor;
  limit: number;
}

/** Tastings with their author, bottle and category, all in the same bar. */
const selectTastings = <E extends SelectedFields>(db: Executor, extra: E) =>
  db
    .select({ ...columns, ...extra })
    .from(tastings)
    .innerJoin(users, eq(users.id, tastings.created_by))
    .innerJoin(
      products,
      and(eq(products.bar_id, tastings.bar_id), eq(products.id, tastings.product_id)),
    )
    .innerJoin(
      categories,
      and(eq(categories.bar_id, products.bar_id), eq(categories.id, products.category_id)),
    );

/** One page of the bar's tastings, newest first; `key` (the day) and `id` make the cursor. */
export function listTastings(
  db: Executor,
  barId: string,
  userId: string,
  {
    productId,
    categoryIds,
    scoreMin,
    scoreMax,
    from,
    to,
    createdBy,
    visibility,
    after,
    limit,
  }: TastingFilter,
): (TastingRow & { key: string })[] {
  return selectTastings(db, { key: tastings.tasted_on })
    .where(
      and(
        eq(tastings.bar_id, barId),
        visibleFeedback(tastings, userId, visibility),
        productId === undefined ? undefined : eq(tastings.product_id, productId),
        categoryIds === undefined ? undefined : inArray(products.category_id, categoryIds),
        // A NULL score never satisfies a comparison, so unscored tastings drop out of score filters.
        scoreMin === undefined ? undefined : gte(tastings.score, scoreMin),
        scoreMax === undefined ? undefined : lte(tastings.score, scoreMax),
        from === undefined ? undefined : gte(tastings.tasted_on, from),
        to === undefined ? undefined : lte(tastings.tasted_on, to),
        createdBy === undefined ? undefined : eq(tastings.created_by, createdBy),
        beforeKey(tastings.tasted_on, tastings.id, after),
      ),
    )
    .orderBy(...newestFirst(tastings.tasted_on, tastings.id))
    .limit(limit)
    .all();
}

export function findTasting(db: Executor, barId: string, userId: string, id: string) {
  return selectTastings(db, {})
    .where(and(eq(tastings.bar_id, barId), eq(tastings.id, id), visibleFeedback(tastings, userId)))
    .get();
}

/** The visible tastings that stop a bottle from being deleted, labelled by day. */
export function listTastingUsage(db: Executor, barId: string, userId: string, productId: string) {
  return db
    .select({ id: tastings.id, tasted_on: tastings.tasted_on })
    .from(tastings)
    .where(
      and(
        eq(tastings.bar_id, barId),
        eq(tastings.product_id, productId),
        visibleFeedback(tastings, userId),
      ),
    )
    .orderBy(desc(tastings.tasted_on), desc(tastings.id))
    .all()
    .map(({ id, tasted_on }) => ({ id, name: `Tasted on ${tasted_on}` }));
}

export function hasTastingUsage(db: Executor, barId: string, productId: string): boolean {
  return (
    db
      .select({ id: tastings.id })
      .from(tastings)
      .where(and(eq(tastings.bar_id, barId), eq(tastings.product_id, productId)))
      .limit(1)
      .get() !== undefined
  );
}

/**
 * Deletes the bottle's private tastings by other people who can no longer write in the bar: nobody
 * left can see or remove them, so the owner deleting the bottle takes them with it.
 */
export function deleteHiddenOrphanedTastings(
  db: Executor,
  barId: string,
  userId: string,
  productId: string,
): void {
  db.delete(tastings)
    .where(
      and(
        eq(tastings.bar_id, barId),
        eq(tastings.product_id, productId),
        eq(tastings.is_private, true),
        ne(tastings.created_by, userId),
        not(authorCanWrite),
      ),
    )
    .run();
}

export function insertTasting(db: Executor, values: NewTasting): string {
  const now = nowIso();
  return db
    .insert(tastings)
    .values({ ...values, created_at: now, updated_at: now })
    .returning({ id: tastings.id })
    .get().id;
}

export function updateTasting(
  db: Executor,
  barId: string,
  id: string,
  changes: TastingChanges,
): void {
  db.update(tastings)
    .set(changes)
    .where(and(eq(tastings.bar_id, barId), eq(tastings.id, id)))
    .run();
}

export function deleteTasting(db: Executor, barId: string, id: string): void {
  db.delete(tastings)
    .where(and(eq(tastings.bar_id, barId), eq(tastings.id, id)))
    .run();
}
