import { z } from "zod";
import { idSchema } from "./id.ts";
import { ancestry, type TreeItem } from "./tree.ts";

/** A required recipe line that nothing in the bar satisfies. */
export const missingIngredientSchema = z.object({
  /** The cocktail ingredient line. */
  id: idSchema,
  /** The preferred source. */
  name: z.string(),
  /** Accepted substitutes, in order; none of them is available either. */
  alternatives: z.string().array(),
});
export type MissingIngredient = z.infer<typeof missingIngredientSchema>;

/** An owned product that can pour a generic category line. */
export const matchingBottleSchema = z.object({ id: idSchema, name: z.string() });
export type MatchingBottle = z.infer<typeof matchingBottleSchema>;

export interface StockSource {
  category_id: string | null;
  product_id: string | null;
  pantry_ingredient_id: string | null;
}

export interface MakeabilityLine extends StockSource {
  id: string;
  name: string;
  optional: boolean;
  alternatives: readonly (StockSource & { name: string })[];
}

/** A bottle in the bar right now. */
interface StockBottle extends MatchingBottle {
  category_id: string;
}

interface StockCategory extends TreeItem {
  always_available?: boolean;
}

/** What the bar can pour from, indexed for repeated lookups. */
export interface Inventory {
  products: ReadonlySet<string>;
  /** Owned bottles by category, listed under their own category and every one above it. */
  categories: ReadonlyMap<string, MatchingBottle[]>;
  /** Categories that count as available without a bottle, including their ancestors. */
  alwaysAvailableCategories: ReadonlySet<string>;
  pantry: ReadonlySet<string>;
}

/** Indexes owned bottles in display order, always-available categories and available pantry ingredients. */
export function buildInventory(
  categories: readonly StockCategory[],
  bottles: readonly StockBottle[],
  pantryIds: readonly string[],
): Inventory {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const alwaysAvailableCategories = new Set<string>();
  for (const category of categories) {
    if (category.always_available) {
      for (const { id } of ancestry(byId, category.id)) alwaysAvailableCategories.add(id);
    }
  }
  const byCategory = new Map<string, MatchingBottle[]>();
  for (const { id, name, category_id } of bottles) {
    // The bottle's own category also counts when it is missing from the tree.
    const above = new Set([category_id, ...ancestry(byId, category_id).map((c) => c.id)]);
    for (const categoryId of above) {
      const list = byCategory.get(categoryId);
      if (list) list.push({ id, name });
      else byCategory.set(categoryId, [{ id, name }]);
    }
  }
  return {
    products: new Set(bottles.map(({ id }) => id)),
    categories: byCategory,
    alwaysAvailableCategories,
    pantry: new Set(pantryIds),
  };
}

export function isAvailable(source: StockSource, inventory: Inventory): boolean {
  if (source.product_id !== null) return inventory.products.has(source.product_id);
  if (source.category_id !== null) {
    return (
      inventory.categories.has(source.category_id) ||
      inventory.alwaysAvailableCategories.has(source.category_id)
    );
  }
  return source.pantry_ingredient_id !== null && inventory.pantry.has(source.pantry_ingredient_id);
}

/**
 * The required lines no available source satisfies, in recipe order. A line is satisfied by its
 * preferred source or any of its alternatives; optional lines never count as missing.
 */
export function makeability(
  lines: readonly MakeabilityLine[],
  inventory: Inventory,
): MissingIngredient[] {
  return lines
    .filter(
      (line) =>
        !line.optional &&
        !isAvailable(line, inventory) &&
        !line.alternatives.some((alternative) => isAvailable(alternative, inventory)),
    )
    .map(({ id, name, alternatives }) => ({
      id,
      name,
      alternatives: alternatives.map((alternative) => alternative.name),
    }));
}

/** The owned bottles that can pour a category source; empty for other sources. */
export function matchingBottles(source: StockSource, inventory: Inventory): MatchingBottle[] {
  return (source.category_id !== null && inventory.categories.get(source.category_id)) || [];
}
