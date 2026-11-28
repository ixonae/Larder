import type { Category, CategoryKind } from "@larder/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { categories } from "../../db/schema/index.ts";
import { selectArtworkKey } from "../images/repo.ts";

const baseColumns: Pick<
  typeof categories,
  | "id"
  | "name"
  | "parent_id"
  | "kind"
  | "default_abv"
  | "always_available"
  | "description"
  | "image_id"
  | "created_at"
  | "updated_at"
> = {
  id: categories.id,
  name: categories.name,
  parent_id: categories.parent_id,
  kind: categories.kind,
  default_abv: categories.default_abv,
  always_available: categories.always_available,
  description: categories.description,
  image_id: categories.image_id,
  created_at: categories.created_at,
  updated_at: categories.updated_at,
};
const columns: typeof baseColumns & { image_artwork_key: SQL<string | null> } = {
  ...baseColumns,
  image_artwork_key: selectArtworkKey(categories),
};

const nameKey: SQL<string> = sql<string>`larder_name_key(${categories.name})`;

export type NewCategory = typeof categories.$inferInsert;
export type CategoryChanges = Partial<
  Pick<
    NewCategory,
    "name" | "parent_id" | "kind" | "default_abv" | "always_available" | "description"
  >
>;

export interface CategoryFilter {
  q?: string;
  kind?: CategoryKind;
  parent_id?: string;
  after?: NameCursor;
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
        afterName(nameKey, categories.id, after),
      ),
    )
    .orderBy(...byName(nameKey, categories.id))
    .limit(limit)
    .all();
}

/** Every category of the bar, sorted by name. */
export function listAllCategories(
  db: Executor,
  barId: string,
  includeArtwork: boolean = false,
): Category[] {
  return db
    .select(includeArtwork ? columns : baseColumns)
    .from(categories)
    .where(eq(categories.bar_id, barId))
    .orderBy(...byName(nameKey, categories.id))
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
    .orderBy(...byName(nameKey, categories.id))
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
