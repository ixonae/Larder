import {
  ancestry,
  type Category,
  type CocktailIngredient,
  type CocktailIngredientInput,
  type IngredientSource,
  type MatchingBottle,
  type StockSource,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { invalid } from "../../errors.ts";
import { findCategory } from "../categories/repo.ts";
import { findPantryIngredient } from "../pantry/repo.ts";
import { findProductRef } from "../products/repo.ts";
import * as repo from "./ingredients-repo.ts";

function findSource(
  db: Executor,
  barId: string,
  source: IngredientSource,
): { id: string; name: string } | undefined {
  if (source.category_id != null) return findCategory(db, barId, source.category_id);
  if (source.product_id != null) return findProductRef(db, barId, source.product_id);
  return findPantryIngredient(db, barId, source.pantry_ingredient_id);
}

function requireSource(
  db: Executor,
  barId: string,
  source: IngredientSource,
  path: (string | number)[],
): void {
  if (!findSource(db, barId, source)) {
    const message = "Choose an ingredient source from this bar";
    throw invalid(message, [{ path, message }]);
  }
}

export function replaceIngredients(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  input: CocktailIngredientInput[],
): void {
  repo.deleteIngredients(db, barId, cocktailId);
  insertIngredients(db, barId, userId, cocktailId, input);
}

export function insertIngredients(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  input: CocktailIngredientInput[],
): void {
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

type ResolvedCategory = {
  category_path: Pick<Category, "id" | "name" | "kind">[];
  abv: number;
};

export function ingredientResolver(
  categories: Category[],
): (categoryId: string) => ResolvedCategory {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const resolved = new Map<string, ResolvedCategory>();
  return (categoryId: string): ResolvedCategory => {
    const cached = resolved.get(categoryId);
    if (cached) return cached;

    const chain = ancestry(byId, categoryId);
    const category = {
      category_path: chain.map(({ id, name, kind }) => ({ id, name, kind })).reverse(),
      abv: chain.find((item) => item.default_abv !== null)?.default_abv ?? 0,
    };
    resolved.set(categoryId, category);
    return category;
  };
}

type ResolveCategory = ReturnType<typeof ingredientResolver>;
export type PreferredIngredient = Omit<
  CocktailIngredient,
  "category_path" | "alternatives" | "matching_bottles"
> &
  ResolvedCategory;

function resolveSource<T extends { source_category_id: string; product_abv: number | null }>(
  { source_category_id, product_abv, ...row }: T,
  resolve: ResolveCategory,
): Omit<T, "product_abv" | "source_category_id"> & ResolvedCategory {
  const { category_path, abv } = resolve(source_category_id);
  return { ...row, category_path, abv: product_abv ?? abv };
}

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
      lines.map(({ cocktail_id: _cocktailId, ...line }) => resolveSource(line, resolve)),
    ]),
  );
}

const categoryPath = (path: PreferredIngredient["category_path"]): { id: string; name: string }[] =>
  path.map(({ id, name }) => ({ id, name }));

type AlternativesByLine = ReturnType<typeof getAlternatives>;

/** The substitutes of every line of these cocktails, grouped by line in their saved order. */
export function getAlternatives(
  db: Executor,
  barId: string,
  cocktailIds: string[],
): Map<string, repo.AlternativeRow[]> {
  return Map.groupBy(repo.listAlternatives(db, barId, cocktailIds), (alt) => alt.ingredient_id);
}

export function addAlternatives(
  lines: PreferredIngredient[],
  alternatives: AlternativesByLine,
  resolve: ResolveCategory,
  bottles: (source: StockSource) => MatchingBottle[],
): CocktailIngredient[] {
  const finish = <T extends StockSource & Pick<PreferredIngredient, "category_path">>(
    source: T,
  ): T & {
    category_path: { id: string; name: string }[];
    matching_bottles: { id: string; name: string }[];
  } => ({
    ...source,
    category_path: categoryPath(source.category_path),
    matching_bottles: bottles(source),
  });
  return lines.map((line) => ({
    ...finish(line),
    alternatives: (alternatives.get(line.id) ?? []).map(({ ingredient_id: _parent, ...alt }) =>
      finish(resolveSource(alt, resolve)),
    ),
  }));
}
