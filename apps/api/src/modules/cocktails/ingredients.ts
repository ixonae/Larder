import {
  ancestors,
  type CocktailIngredient,
  type CocktailIngredientInput,
  type IngredientSource,
  ingredientSourceSchema,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { invalid } from "../../errors.ts";
import { findCategory, listAllCategories } from "../categories/repo.ts";
import { findPantryIngredient } from "../pantry/repo.ts";
import { findProduct } from "../products/repo.ts";
import * as repo from "./ingredients-repo.ts";

function findSource(db: Executor, barId: string, source: IngredientSource) {
  if (source.category_id != null) {
    const category = findCategory(db, barId, source.category_id);
    return category && { name: category.name, category_id: category.id };
  }
  if (source.product_id != null) return findProduct(db, barId, source.product_id);
  return findPantryIngredient(db, barId, source.pantry_ingredient_id);
}

function requireSource(
  db: Executor,
  barId: string,
  source: IngredientSource,
  path: (string | number)[],
) {
  const entry = findSource(db, barId, source);
  if (!entry) {
    const message = "Choose an ingredient source from this bar";
    throw invalid(message, [{ path, message }]);
  }
  return entry;
}

export function replaceIngredients(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  input: CocktailIngredientInput[],
) {
  repo.deleteIngredients(db, barId, cocktailId);
  const audit = { bar_id: barId, created_by: userId };
  for (const [position, { alternatives, ...line }] of input.entries()) {
    const path = ["ingredients", position];
    requireSource(db, barId, line, path);
    const id = repo.insertIngredient(db, { ...line, ...audit, cocktail_id: cocktailId, position });
    for (const [alternativePosition, alternative] of alternatives.entries()) {
      requireSource(db, barId, alternative, [...path, "alternatives", alternativePosition]);
      repo.insertAlternative(db, {
        ...alternative,
        ...audit,
        ingredient_id: id,
        position: alternativePosition,
      });
    }
  }
}

export function getIngredients(db: Executor, barId: string, id: string): CocktailIngredient[] {
  const lines = repo.listIngredients(db, barId, id);
  if (lines.length === 0) return [];

  const categories = listAllCategories(db, barId);
  const alternatives = Map.groupBy(
    repo.listAlternatives(db, barId, id),
    (alt) => alt.ingredient_id,
  );
  function resolve(row: Omit<ReturnType<typeof repo.listAlternatives>[number], "ingredient_id">) {
    const source = requireSource(db, barId, ingredientSourceSchema.parse(row), ["ingredients"]);
    const chain = [
      ...categories.filter((category) => category.id === source.category_id),
      ...ancestors(categories, source.category_id),
    ];
    return {
      ...row,
      name: source.name,
      category_path: chain.map((item) => ({ id: item.id, name: item.name })).reverse(),
      abv:
        ("abv" in source ? source.abv : null) ??
        chain.find((item) => item.default_abv !== null)?.default_abv ??
        0,
    };
  }

  return lines.map((line) => ({
    ...line,
    ...resolve(line),
    alternatives: (alternatives.get(line.id) ?? []).map(({ ingredient_id: _parent, ...alt }) =>
      resolve(alt),
    ),
  }));
}
