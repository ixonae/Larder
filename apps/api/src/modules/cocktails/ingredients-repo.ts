import { and, eq, exists, getTableColumns, or } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { byName } from "../../db/cursor.ts";
import {
  cocktailIngredientAlternatives as alternatives,
  cocktails,
  cocktailIngredients as ingredients,
} from "../../db/schema/index.ts";
import { nameKey } from "./repo.ts";

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

export function listIngredients(db: Executor, barId: string, id: string) {
  return db
    .select(lineColumns)
    .from(ingredients)
    .where(inCocktail(barId, id))
    .orderBy(ingredients.position)
    .all();
}

export function listAlternatives(db: Executor, barId: string, id: string) {
  return db
    .select(alternativeColumns)
    .from(alternatives)
    .innerJoin(
      ingredients,
      and(
        eq(alternatives.bar_id, ingredients.bar_id),
        eq(alternatives.ingredient_id, ingredients.id),
      ),
    )
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
    .orderBy(...byName(nameKey, cocktails.id))
    .all();
}
