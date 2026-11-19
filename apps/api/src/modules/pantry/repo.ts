import type { PantryIngredient } from "@larder/shared";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { categories, pantryIngredients } from "../../db/schema/index.ts";

const columns = {
  id: pantryIngredients.id,
  name: pantryIngredients.name,
  category_id: pantryIngredients.category_id,
  category_name: categories.name,
  in_stock: pantryIngredients.in_stock,
  always_available: pantryIngredients.always_available,
  created_at: pantryIngredients.created_at,
  updated_at: pantryIngredients.updated_at,
};

const nameKey = sql<string>`larder_name_key(${pantryIngredients.name})`;

export type NewPantryIngredient = typeof pantryIngredients.$inferInsert;
export type PantryIngredientChanges = Partial<
  Pick<NewPantryIngredient, "name" | "category_id" | "in_stock" | "always_available">
>;

export interface PantryIngredientFilter {
  q?: string | undefined;
  /** Any of these categories. */
  categoryIds?: string[] | undefined;
  available?: boolean | undefined;
  after?: NameCursor | undefined;
  limit: number;
}

/** Ingredients joined with their category (same bar, enforced by the foreign key). */
const selectIngredients = <E extends SelectedFields>(db: Executor, extra: E) =>
  db
    .select({ ...columns, ...extra })
    .from(pantryIngredients)
    .innerJoin(
      categories,
      and(
        eq(categories.bar_id, pantryIngredients.bar_id),
        eq(categories.id, pantryIngredients.category_id),
      ),
    );

function availability(available: boolean | undefined): SQL | undefined {
  if (available === undefined) return undefined;
  const either = or(
    eq(pantryIngredients.in_stock, true),
    eq(pantryIngredients.always_available, true),
  );
  return available ? either : sql`NOT (${either})`;
}

/** One page of the bar's ingredients sorted by name; each row carries its name `key` for the cursor. */
export function listPantryIngredients(
  db: Executor,
  barId: string,
  { q, categoryIds, available, after, limit }: PantryIngredientFilter,
): (PantryIngredient & { key: string })[] {
  return selectIngredients(db, { key: nameKey })
    .where(
      and(
        eq(pantryIngredients.bar_id, barId),
        q === undefined ? undefined : sql`instr(${nameKey}, larder_name_key(${q})) > 0`,
        categoryIds === undefined ? undefined : inArray(pantryIngredients.category_id, categoryIds),
        availability(available),
        afterName(nameKey, pantryIngredients.id, after),
      ),
    )
    .orderBy(...byName(nameKey, pantryIngredients.id))
    .limit(limit)
    .all();
}

export function findPantryIngredient(
  db: Executor,
  barId: string,
  id: string,
): PantryIngredient | undefined {
  return selectIngredients(db, {})
    .where(and(eq(pantryIngredients.bar_id, barId), eq(pantryIngredients.id, id)))
    .get();
}

/** The ingredients grouped directly under a category: they stop it from being deleted. */
export function listPantryIngredientsInCategory(
  db: Executor,
  barId: string,
  categoryId: string,
): { id: string; name: string }[] {
  return db
    .select({ id: pantryIngredients.id, name: pantryIngredients.name })
    .from(pantryIngredients)
    .where(and(eq(pantryIngredients.bar_id, barId), eq(pantryIngredients.category_id, categoryId)))
    .orderBy(...byName(nameKey, pantryIngredients.id))
    .all();
}

export function insertPantryIngredient(db: Executor, values: NewPantryIngredient): string {
  return db.insert(pantryIngredients).values(values).returning({ id: pantryIngredients.id }).get()
    .id;
}

export function insertPantryIngredients(db: Executor, values: NewPantryIngredient[]): void {
  db.insert(pantryIngredients).values(values).run();
}

export function updatePantryIngredient(
  db: Executor,
  barId: string,
  id: string,
  changes: PantryIngredientChanges,
): void {
  db.update(pantryIngredients)
    .set(changes)
    .where(and(eq(pantryIngredients.bar_id, barId), eq(pantryIngredients.id, id)))
    .run();
}

export function deletePantryIngredient(db: Executor, barId: string, id: string): void {
  db.delete(pantryIngredients)
    .where(and(eq(pantryIngredients.bar_id, barId), eq(pantryIngredients.id, id)))
    .run();
}
