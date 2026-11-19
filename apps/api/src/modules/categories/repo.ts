import type { Category, CategoryKind } from "@larder/shared";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import type { NameCursor } from "../../db/cursor.ts";
import { categories } from "../../db/schema/index.ts";

const columns = {
  id: categories.id,
  name: categories.name,
  parent_id: categories.parent_id,
  kind: categories.kind,
  default_abv: categories.default_abv,
  description: categories.description,
  always_available: categories.always_available,
  in_stock: categories.in_stock,
  created_at: categories.created_at,
  updated_at: categories.updated_at,
};

const nameKey = sql<string>`larder_name_key(${categories.name})`;

export type NewCategory = typeof categories.$inferInsert;
export type CategoryChanges = Partial<
  Pick<
    NewCategory,
    "name" | "parent_id" | "kind" | "default_abv" | "description" | "always_available" | "in_stock"
  >
>;

export interface CategoryFilter {
  q?: string | undefined;
  kind?: CategoryKind | undefined;
  parent_id?: string | undefined;
  after?: NameCursor | undefined;
  limit: number;
}

/** One page of the bar's categories sorted by name; each row carries its name `key` for the cursor. */
export function listCategories(
  db: Executor,
  barId: string,
  { q, kind, parent_id, after, limit }: CategoryFilter,
): (Category & { key: string })[] {
  return db
    .select({ ...columns, key: nameKey })
    .from(categories)
    .where(
      and(
        eq(categories.bar_id, barId),
        q === undefined ? undefined : sql`instr(${nameKey}, larder_name_key(${q})) > 0`,
        kind === undefined ? undefined : eq(categories.kind, kind),
        parent_id === undefined ? undefined : eq(categories.parent_id, parent_id),
        after === undefined
          ? undefined
          : or(gt(nameKey, after.key), and(eq(nameKey, after.key), gt(categories.id, after.id))),
      ),
    )
    .orderBy(asc(nameKey), asc(categories.id))
    .limit(limit)
    .all();
}

/** Every category of the bar, sorted by name. */
export function listAllCategories(db: Executor, barId: string): Category[] {
  return db
    .select(columns)
    .from(categories)
    .where(eq(categories.bar_id, barId))
    .orderBy(asc(nameKey), asc(categories.id))
    .all();
}

export function findCategory(db: Executor, barId: string, id: string): Category | undefined {
  return db
    .select(columns)
    .from(categories)
    .where(and(eq(categories.bar_id, barId), eq(categories.id, id)))
    .get();
}

export function listChildren(
  db: Executor,
  barId: string,
  id: string,
): { id: string; name: string }[] {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.bar_id, barId), eq(categories.parent_id, id)))
    .orderBy(asc(nameKey), asc(categories.id))
    .all();
}

export function insertCategory(db: Executor, values: NewCategory): Category {
  return db.insert(categories).values(values).returning(columns).get();
}

export function insertCategories(db: Executor, values: NewCategory[]): void {
  db.insert(categories).values(values).run();
}

export function updateCategory(
  db: Executor,
  barId: string,
  id: string,
  changes: CategoryChanges,
): Category {
  return db
    .update(categories)
    .set(changes)
    .where(and(eq(categories.bar_id, barId), eq(categories.id, id)))
    .returning(columns)
    .get() as Category;
}

export function deleteCategory(db: Executor, barId: string, id: string): void {
  db.delete(categories)
    .where(and(eq(categories.bar_id, barId), eq(categories.id, id)))
    .run();
}
