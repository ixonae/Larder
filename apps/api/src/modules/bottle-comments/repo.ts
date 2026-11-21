import { type ListBottleCommentsQuery, nowIso, type UpdateComment } from "@larder/shared";
import { and, eq, type SQL } from "drizzle-orm";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { beforeKey, type NameCursor, newestFirst } from "../../db/cursor.ts";
import { bottleComments, users } from "../../db/schema/index.ts";
import { visibleFeedback } from "../../db/visibility.ts";

export type BottleCommentRow = SelectResultFields<typeof columns>;

const columns: Pick<
  typeof bottleComments,
  "id" | "product_id" | "body" | "is_private" | "created_by" | "created_at" | "updated_at"
> & { display_name: typeof users.display_name } = {
  id: bottleComments.id,
  product_id: bottleComments.product_id,
  body: bottleComments.body,
  is_private: bottleComments.is_private,
  created_by: bottleComments.created_by,
  display_name: users.display_name,
  created_at: bottleComments.created_at,
  updated_at: bottleComments.updated_at,
};

// biome-ignore lint/nursery/useExplicitType: Drizzle infers the result shape and nullability from the selected fields and joins.
const select = <E extends SelectedFields>(db: Executor, extra: E) =>
  db
    .select({ ...columns, ...extra })
    .from(bottleComments)
    .innerJoin(users, eq(users.id, bottleComments.created_by));

const ofProduct = (barId: string, productId: string): SQL | undefined =>
  and(eq(bottleComments.bar_id, barId), eq(bottleComments.product_id, productId));

/** The bottle's thread, newest first; `key` (the creation time) and `id` make the cursor. */
export function listBottleComments(
  db: Executor,
  barId: string,
  userId: string,
  productId: string,
  { limit, visibility }: ListBottleCommentsQuery,
  after: NameCursor | undefined,
): (BottleCommentRow & { key: string })[] {
  return select(db, { key: bottleComments.created_at })
    .where(
      and(
        ofProduct(barId, productId),
        visibleFeedback(bottleComments, userId, visibility),
        beforeKey(bottleComments.created_at, bottleComments.id, after),
      ),
    )
    .orderBy(...newestFirst(bottleComments.created_at, bottleComments.id))
    .limit(limit + 1)
    .all();
}

export function findBottleComment(
  db: Executor,
  barId: string,
  userId: string,
  productId: string,
  id: string,
): BottleCommentRow | undefined {
  return select(db, {})
    .where(
      and(
        ofProduct(barId, productId),
        eq(bottleComments.id, id),
        visibleFeedback(bottleComments, userId),
      ),
    )
    .get();
}

export function insertBottleComment(
  db: Executor,
  values: typeof bottleComments.$inferInsert,
): string {
  const now = nowIso();
  return db
    .insert(bottleComments)
    .values({ ...values, created_at: now, updated_at: now })
    .returning({ id: bottleComments.id })
    .get().id;
}

export function updateBottleComment(
  db: Executor,
  barId: string,
  id: string,
  patch: UpdateComment,
): void {
  db.update(bottleComments)
    .set(patch)
    .where(and(eq(bottleComments.bar_id, barId), eq(bottleComments.id, id)))
    .run();
}

export function deleteBottleComment(db: Executor, barId: string, id: string): void {
  db.delete(bottleComments)
    .where(and(eq(bottleComments.bar_id, barId), eq(bottleComments.id, id)))
    .run();
}
