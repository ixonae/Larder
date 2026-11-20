import {
  type Category,
  categoryKindSchema,
  createCocktailSchema,
  createPantryIngredientSchema,
  createProductSchema,
  type ImageEntity,
  type IngredientSource,
  isBottleCategory,
  isPantryCategoryKind,
  unitSchema,
} from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { insertCategory, listAllCategories } from "../../modules/categories/repo.ts";
import { insertIngredients } from "../../modules/cocktails/ingredients.ts";
import { insertSteps } from "../../modules/cocktails/recipe-repo.ts";
import { insertCocktail } from "../../modules/cocktails/repo.ts";
import { findOwnerImage, insertImage, setOwnerImage } from "../../modules/images/repo.ts";
import { removeImageFiles, stageImage } from "../../modules/images/service.ts";
import { insertPantryIngredient } from "../../modules/pantry/repo.ts";
import { insertProduct } from "../../modules/products/repo.ts";
import { insertUtensil } from "../../modules/utensils/repo.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import { type Db, nameKey, type Tx } from "../client.ts";
import {
  barDataMigrations,
  bars,
  cocktails,
  pantryIngredients,
  products,
  utensils,
} from "../schema/index.ts";

export const catalogueCategorySchema = z.object({
  kind: categoryKindSchema,
  path: z.tuple([z.string().min(1)], z.string().min(1)),
  abv: z.number().min(0).max(100).optional(),
});

export const catalogueSourceSchema = catalogueCategorySchema.extend({ key: z.string() }).and(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("category") }),
    z.object({
      type: z.literal("product"),
      name: createProductSchema.shape.name,
      product_abv: createProductSchema.shape.abv,
    }),
    z.object({ type: z.literal("pantry"), name: createPantryIngredientSchema.shape.name }),
  ]),
);

export const catalogueRecipeSchema = createCocktailSchema
  .pick({ name: true, method: true, ice: true, garnish: true, serving_notes: true, source: true })
  .extend({
    id: z.string(),
    glass: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    ingredients: z
      .array(
        z.object({
          ref: z.string(),
          amount: z.number().positive().optional(),
          unit: unitSchema,
          note: z.string().optional(),
          optional: z.boolean().optional(),
          preparation_only: z.boolean().optional(),
          alternatives: z
            .array(z.object({ ref: z.string(), note: z.string().optional() }))
            .optional(),
        }),
      )
      .min(1),
  });

type CatalogueCategory = z.infer<typeof catalogueCategorySchema>;

export interface Catalogue {
  /** Stable version identifier, recorded once per bar. */
  id: string;
  categories: CatalogueCategory[];
  sources: z.infer<typeof catalogueSourceSchema>[];
  recipes: z.infer<typeof catalogueRecipeSchema>[];
  /**
   * Image bytes by target key. Use categoryPictureKey for categories.
   * Other examples are "product:Campari", "glass:Coupe" and "cocktail:negroni".
   */
  pictures?: ReadonlyMap<string, Uint8Array>;
}

export function categoryPictureKey(path: readonly string[]): string {
  return `category:${JSON.stringify(path.map(nameKey))}`;
}

const scopedCategoryKey = (parentId: string | null, name: string) =>
  JSON.stringify([parentId, nameKey(name)]);

const importedCocktailSchema = createCocktailSchema.omit({ tags: true }).required({
  ingredients: true,
  steps: true,
});

export const catalogueRecord = (barId: string, id: string) =>
  and(eq(barDataMigrations.bar_id, barId), eq(barDataMigrations.migration, id));

function required<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Unknown catalogue reference: ${key}`);
  return value;
}

/** Find the matching type or a free name without overwriting a differently typed entry. */
function availableName<T, K>(
  name: string,
  kind: K,
  find: (name: string) => T | undefined,
  kindOf: (row: T) => K,
) {
  const existing = find(name);
  if (!existing || kindOf(existing) === kind) return { name, existing };
  for (let index = 1; ; index++) {
    const candidate = index === 1 ? `${name} (${kind})` : `${name} (${kind} ${index})`;
    const row = find(candidate);
    if (!row || kindOf(row) === kind) return { name: candidate, existing: row };
  }
}

type StagedImage = Awaited<ReturnType<typeof stageImage>>;

function insertCatalogue(
  tx: Tx,
  barId: string,
  userId: string,
  catalogue: Catalogue,
  staged: ReadonlyMap<string, StagedImage>,
) {
  const targets = new Map<string, { entity: ImageEntity; id: string }>();
  const trackImage = (key: string, entity: ImageEntity, id: string) => {
    if (staged.has(key)) targets.set(key, { entity, id });
  };
  const audit = { bar_id: barId, created_by: userId };
  const catalogueCategories = listAllCategories(tx, barId);
  const categoriesByParent = new Map(
    catalogueCategories.map((row) => [scopedCategoryKey(row.parent_id, row.name), row]),
  );
  const categoriesById = new Map(catalogueCategories.map((row) => [row.id, row]));
  function ensureCategory({ kind, path, abv }: CatalogueCategory): Category {
    let parent: Category | undefined;
    for (const [index, name] of path.entries()) {
      const parentId = parent?.id ?? null;
      const slot = availableName(
        name,
        kind,
        (candidate) => categoriesByParent.get(scopedCategoryKey(parentId, candidate)),
        (row) => row.kind,
      );
      parent =
        slot.existing ??
        insertCategory(tx, {
          ...audit,
          parent_id: parentId,
          kind,
          name: slot.name,
          default_abv: index === path.length - 1 ? abv : undefined,
        });
      categoriesByParent.set(scopedCategoryKey(parentId, slot.name), parent);
      categoriesById.set(parent.id, parent);
      trackImage(categoryPictureKey(path.slice(0, index + 1)), "categories", parent.id);
    }
    // The catalogue schema requires at least one segment.
    return parent as Category;
  }

  const sources = new Map<string, IngredientSource>();
  // Materialize explicit ABV defaults before any source creates a category by reference.
  for (const source of catalogue.sources) {
    if (source.type === "category")
      sources.set(source.key, { category_id: ensureCategory(source).id });
  }
  for (const category of catalogue.categories) ensureCategory(category);

  const bottles = new Map(
    tx
      .select()
      .from(products)
      .where(eq(products.bar_id, barId))
      .all()
      .filter((row) => row.vintage === null)
      .map((row) => [nameKey(row.name), row.id]),
  );
  const pantry = new Map(
    tx
      .select()
      .from(pantryIngredients)
      .where(eq(pantryIngredients.bar_id, barId))
      .all()
      .map((row) => [scopedCategoryKey(row.category_id, row.name), row.id]),
  );
  for (const source of catalogue.sources) {
    if (source.type === "category") continue;
    const category = ensureCategory(source);
    const category_id = category.id;
    const { name } = source;
    if (source.type === "product") {
      if (!isBottleCategory(category, categoriesById)) {
        throw new Error(`Choose a bottle category for ${name}.`);
      }
      const key = nameKey(name);
      const id =
        bottles.get(key) ??
        insertProduct(tx, {
          ...audit,
          name,
          category_id,
          abv: source.product_abv,
        });
      bottles.set(key, id);
      trackImage(`product:${name}`, "products", id);
      sources.set(source.key, { product_id: id });
    } else {
      if (!isPantryCategoryKind(category.kind)) {
        throw new Error(`Choose a pantry category for ${name}.`);
      }
      const key = scopedCategoryKey(category_id, name);
      const id = pantry.get(key) ?? insertPantryIngredient(tx, { ...audit, name, category_id });
      pantry.set(key, id);
      sources.set(source.key, { pantry_ingredient_id: id });
    }
  }

  const glassware = new Map(
    tx
      .select()
      .from(utensils)
      .where(eq(utensils.bar_id, barId))
      .all()
      .map(({ id, name, kind }) => [nameKey(name), { id, kind }]),
  );
  const existing = new Map(
    tx
      .select({ name: cocktails.name, id: cocktails.id })
      .from(cocktails)
      .where(eq(cocktails.bar_id, barId))
      .all()
      .map(({ name, id }) => [nameKey(name), id]),
  );
  for (const recipe of catalogue.recipes) {
    const key = nameKey(recipe.name);
    const slot = availableName(
      recipe.glass,
      "glass",
      (name) => glassware.get(nameKey(name)),
      (row) => row.kind,
    );
    const glass_id =
      slot.existing?.id ??
      insertUtensil(tx, {
        ...audit,
        kind: "glass",
        name: slot.name,
      });
    glassware.set(nameKey(slot.name), { id: glass_id, kind: "glass" });
    trackImage(`glass:${recipe.glass}`, "utensils", glass_id);
    const existingId = existing.get(key);
    if (existingId) {
      trackImage(`cocktail:${recipe.id}`, "cocktails", existingId);
      continue;
    }
    const input = importedCocktailSchema.parse({
      ...recipe,
      glass_id,
      steps: recipe.steps.map((value) => ({ text: value })),
      ingredients: recipe.ingredients.map(({ ref, alternatives, ...quantity }) => ({
        ...quantity,
        ...required(sources, ref),
        alternatives: alternatives?.map(({ ref, note }) => ({ ...required(sources, ref), note })),
      })),
    });
    const { ingredients, steps, ...cocktail } = input;
    const { id } = insertCocktail(tx, {
      ...audit,
      ...cocktail,
    });
    insertIngredients(tx, barId, userId, id, ingredients);
    insertSteps(tx, { ...audit, cocktail_id: id }, steps);
    existing.set(key, id);
    trackImage(`cocktail:${recipe.id}`, "cocktails", id);
  }
  const used = new Set<string>();
  for (const [key, image] of staged) {
    const target = targets.get(key);
    if (target && findOwnerImage(tx, target.entity, barId, target.id)?.image_id === null) {
      const { id } = insertImage(tx, image);
      setOwnerImage(tx, target.entity, barId, target.id, id);
      used.add(key);
    }
  }
  return used;
}

/** Import one version into one bar. Existing entries are reused by name, and missing pictures can be filled. */
export async function importCatalogue(
  db: Db,
  storage: ImageStorage,
  barId: string,
  catalogue: Catalogue,
) {
  const record = catalogueRecord(barId, catalogue.id);
  const alreadyImported = () => db.select().from(barDataMigrations).where(record).get();
  if (alreadyImported()) return;
  const bar = db.select().from(bars).where(eq(bars.id, barId)).get();
  if (!bar) throw new Error(`Unknown bar: ${barId}`);

  const staged = new Map<string, StagedImage>();
  let used: ReadonlySet<string> = new Set();
  try {
    for (const [key, bytes] of catalogue.pictures ?? []) {
      staged.set(key, await stageImage({ barId, userId: bar.owner_id, storage }, bytes));
    }
    used = db.transaction(
      (tx) => {
        if (tx.select().from(barDataMigrations).where(record).get()) return new Set<string>();
        const attached = insertCatalogue(tx, barId, bar.owner_id, catalogue, staged);
        tx.insert(barDataMigrations).values({ bar_id: barId, migration: catalogue.id }).run();
        return attached;
      },
      { behavior: "immediate" },
    );
  } finally {
    await Promise.all(
      [...staged]
        .filter(([key]) => !used.has(key))
        .map(([, image]) => removeImageFiles(storage, image)),
    );
  }
}
