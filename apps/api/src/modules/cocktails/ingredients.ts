import {
  ancestors,
  type Category,
  type CocktailIngredient,
  type CocktailIngredientInput,
  type IngredientSource,
  ingredientSourceSchema,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { invalid } from "../../errors.ts";
import { findCategory } from "../categories/repo.ts";
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

export function ingredientResolver(categories: Category[]) {
  const chains = new Map<string, Category[]>();
  return (categoryId: string, productAbv: number | null) => {
    let chain = chains.get(categoryId);
    if (!chain) {
      chain = [
        ...categories.filter((category) => category.id === categoryId),
        ...ancestors(categories, categoryId),
      ];
      chains.set(categoryId, chain);
    }
    return {
      category_path: chain.map(({ id, name, kind }) => ({ id, name, kind })).reverse(),
      abv: productAbv ?? chain.find((item) => item.default_abv !== null)?.default_abv ?? 0,
    };
  };
}

type ResolveCategory = ReturnType<typeof ingredientResolver>;
export type PreferredIngredient = Omit<CocktailIngredient, "category_path" | "alternatives"> &
  ReturnType<ResolveCategory>;

export function getPreferredIngredients(
  db: Executor,
  barId: string,
  cocktailIds: string[],
  resolve: ResolveCategory,
): Map<string, PreferredIngredient[]> {
  const rows = repo.listIngredients(db, barId, cocktailIds);
  return new Map(
    [...Map.groupBy(rows, (row) => row.cocktail_id)].map(([id, lines]) => [
      id,
      lines.map(({ cocktail_id: _cocktailId, source_category_id, product_abv, ...line }) => ({
        ...line,
        ...resolve(source_category_id, product_abv),
      })),
    ]),
  );
}

const categoryPath = (path: PreferredIngredient["category_path"]) =>
  path.map(({ id, name }) => ({ id, name }));

export function addAlternatives(
  db: Executor,
  barId: string,
  id: string,
  lines: PreferredIngredient[],
  resolve: ResolveCategory,
): CocktailIngredient[] {
  const alternatives = Map.groupBy(
    repo.listAlternatives(db, barId, id),
    (alt) => alt.ingredient_id,
  );
  return lines.map((line) => ({
    ...line,
    category_path: categoryPath(line.category_path),
    alternatives: (alternatives.get(line.id) ?? []).map(({ ingredient_id: _parent, ...alt }) => {
      const source = requireSource(db, barId, ingredientSourceSchema.parse(alt), ["ingredients"]);
      const { category_path, abv } = resolve(
        source.category_id,
        "abv" in source ? source.abv : null,
      );
      return { ...alt, name: source.name, category_path: categoryPath(category_path), abv };
    }),
  }));
}
