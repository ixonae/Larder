import { and, eq, exists, getTableColumns, inArray, or, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { byName } from "../../db/cursor.ts";
import {
  cocktailIngredientAlternatives as alternatives,
  categories,
  cocktails,
  cocktailIngredients as ingredients,
  pantryIngredients,
  products,
} from "../../db/schema/index.ts";

const {
  bar_id: _lineBar,
  created_by: _lineAuthor,
  created_at: _lineCreated,
  updated_at: _lineUpdated,
  cocktail_id: _cocktail,
  ...lineColumns
} = getTableColumns(ingredients);
const {
  bar_id: _altBar,
  created_by: _altAuthor,
  created_at: _altCreated,
  updated_at: _altUpdated,
  ...alternativeColumns
} = getTableColumns(alternatives);
const inCocktail = (barId: string, id: string) =>
  and(eq(ingredients.bar_id, barId), eq(ingredients.cocktail_id, id));
export type NewLine = typeof ingredients.$inferInsert;
export type NewAlternative = typeof alternatives.$inferInsert;

export function deleteIngredients(db: Executor, barId: string, id: string) {
  db.delete(ingredients).where(inCocktail(barId, id)).run();
}

export function insertIngredient(db: Executor, input: NewLine) {
  return db.insert(ingredients).values(input).returning({ id: ingredients.id }).get().id;
}

export function insertAlternative(db: Executor, input: NewAlternative) {
  db.insert(alternatives).values(input).run();
}

type SourceTable = typeof ingredients | typeof alternatives;

const sourceCategoryId = (source: SourceTable) =>
  sql<string>`coalesce(${source.category_id}, ${products.category_id}, ${pantryIngredients.category_id})`;

const sourceFields = (source: SourceTable) => ({
  source_category_id: sourceCategoryId(source),
  name: sql<string>`coalesce(${categories.name}, ${products.name}, ${pantryIngredients.name})`,
  product_abv: products.abv,
});

function joinSources<T extends SQLiteSelect>(query: T, source: SourceTable) {
  return query
    .leftJoin(
      categories,
      and(eq(categories.bar_id, source.bar_id), eq(categories.id, source.category_id)),
    )
    .leftJoin(products, and(eq(products.bar_id, source.bar_id), eq(products.id, source.product_id)))
    .leftJoin(
      pantryIngredients,
      and(
        eq(pantryIngredients.bar_id, source.bar_id),
        eq(pantryIngredients.id, source.pantry_ingredient_id),
      ),
    );
}

export function listIngredients(db: Executor, barId: string, cocktailIds: string[]) {
  const rows = db
    .select({ ...lineColumns, cocktail_id: ingredients.cocktail_id, ...sourceFields(ingredients) })
    .from(ingredients)
    .$dynamic();
  return joinSources(rows, ingredients)
    .where(and(eq(ingredients.bar_id, barId), inArray(ingredients.cocktail_id, cocktailIds)))
    .orderBy(ingredients.position)
    .all();
}

export function usesSpiritCategories(db: Executor, barId: string, categoryIds: string[]) {
  const lines = db.select({ id: ingredients.id }).from(ingredients).$dynamic();
  return exists(
    joinSources(lines, ingredients).where(
      and(
        eq(ingredients.bar_id, barId),
        eq(ingredients.cocktail_id, cocktails.id),
        eq(ingredients.preparation_only, false),
        // One parameter keeps large subtrees within SQLite's bind limit.
        sql`${sourceCategoryId(ingredients)} IN (SELECT value FROM json_each(${JSON.stringify(categoryIds)}))`,
      ),
    ),
  );
}

export function listAlternatives(db: Executor, barId: string, id: string) {
  const rows = db
    .select({ ...alternativeColumns, ...sourceFields(alternatives) })
    .from(alternatives)
    .innerJoin(
      ingredients,
      and(
        eq(alternatives.bar_id, ingredients.bar_id),
        eq(alternatives.ingredient_id, ingredients.id),
      ),
    )
    .$dynamic();
  return joinSources(rows, alternatives)
    .where(inCocktail(barId, id))
    .orderBy(alternatives.position)
    .all();
}

export function listIngredientUsage(
  db: Executor,
  barId: string,
  field: "category_id" | "product_id" | "pantry_ingredient_id",
  id: string,
) {
  const substitutes = db
    .select({ id: alternatives.id })
    .from(alternatives)
    .where(
      and(
        eq(alternatives.bar_id, barId),
        eq(alternatives.ingredient_id, ingredients.id),
        eq(alternatives[field], id),
      ),
    );
  const lines = db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      and(
        eq(ingredients.bar_id, barId),
        eq(ingredients.cocktail_id, cocktails.id),
        or(eq(ingredients[field], id), exists(substitutes)),
      ),
    );
  return db
    .select({ id: cocktails.id, name: cocktails.name })
    .from(cocktails)
    .where(and(eq(cocktails.bar_id, barId), exists(lines)))
    .orderBy(...byName(sql`larder_name_key(${cocktails.name})`, cocktails.id))
    .all();
}
