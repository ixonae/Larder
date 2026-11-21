import {
  type Category,
  type CategoryKind,
  COCKTAIL_THUMB_MAX_SIDE,
  categoryKindSchema,
  createCocktailSchema,
  createPantryIngredientSchema,
  createProductSchema,
  createUtensilSchema,
  type ImageEntity,
  type IngredientSource,
  isBottleCategory,
  isPantryCategoryKind,
  nameKey,
  type UtensilKind,
  unitSchema,
} from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { insertCategory, listAllCategories } from "../../modules/categories/repo.ts";
import { insertIngredients } from "../../modules/cocktails/ingredients.ts";
import { insertSteps, insertTools } from "../../modules/cocktails/recipe-repo.ts";
import { insertCocktail } from "../../modules/cocktails/repo.ts";
import { findOwnerImage, insertImage, setOwnerImage } from "../../modules/images/repo.ts";
import { removeImageFiles, stageImage, stagePreparedImage } from "../../modules/images/service.ts";
import { insertPantryIngredient } from "../../modules/pantry/repo.ts";
import { insertProduct } from "../../modules/products/repo.ts";
import { insertUtensil } from "../../modules/utensils/repo.ts";
import type { ProcessedImage } from "../../storage/process.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import type { Db, Tx } from "../client.ts";
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
      /** ISO 3166-1 alpha-2 code: an unknown one fails the catalogue's validation. */
      country: createProductSchema.shape.country,
      /** Where within the country ("Scotland", "Kentucky"). */
      region: createProductSchema.shape.region,
    }),
    z.object({ type: z.literal("pantry"), name: createPantryIngredientSchema.shape.name }),
  ]),
);

export const catalogueRecipeSchema = createCocktailSchema
  .pick({ name: true, method: true, ice: true, garnish: true, serving_notes: true, source: true })
  .extend({
    id: z.string(),
    glass: z.string().min(1),
    tools: createUtensilSchema.shape.name.array().optional(),
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
  glassware?: readonly string[];
  tools?: readonly string[];
  /**
   * Image bytes or prepared WebP pairs by target key. Use categoryPictureKey for categories and
   * pantryPictureKey for pantry ingredients.
   * Other examples are "product:Campari", "glass:Coupe", "tool:Shaker" and "cocktail:negroni".
   */
  pictures?: ReadonlyMap<string, Uint8Array | ProcessedImage>;
  /** Match picture keys to existing roots of the expected kind without creating categories. */
  existingRootPictureKinds?: ReadonlyMap<string, CategoryKind>;
}

export function categoryPictureKey(path: readonly string[]): string {
  return `category:${JSON.stringify(path.map((name) => nameKey(name)))}`;
}

export function pantryPictureKey(
  kind: CategoryKind,
  path: readonly string[],
  name: string,
): string {
  return `pantry:${JSON.stringify([kind, path.map((name) => nameKey(name)), nameKey(name)])}`;
}

const scopedCategoryKey = (parentId: string | null, name: string) =>
  JSON.stringify([parentId, nameKey(name)]);

const importedCocktailSchema = createCocktailSchema.omit({ tags: true }).required({
  ingredients: true,
  steps: true,
  tool_ids: true,
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

type ImportAudit = { bar_id: string; created_by: string };
type ImageTarget = { entity: ImageEntity; id: string };
type TrackImage = (key: string, entity: ImageEntity, id: string) => void;

function catalogueCategoryLookup(
  tx: Tx,
  audit: ImportAudit,
  existingRootPictureKinds: Catalogue["existingRootPictureKinds"],
  trackImage: TrackImage,
) {
  const catalogueCategories = listAllCategories(tx, audit.bar_id);
  if (existingRootPictureKinds) {
    for (const { id, name, kind, parent_id } of catalogueCategories) {
      const key = categoryPictureKey([name]);
      if (parent_id === null && existingRootPictureKinds.get(key) === kind) {
        trackImage(key, "categories", id);
      }
    }
  }
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
  return { ensureCategory, categoriesById };
}

function importSources(
  tx: Tx,
  audit: ImportAudit,
  catalogue: Catalogue,
  { ensureCategory, categoriesById }: ReturnType<typeof catalogueCategoryLookup>,
  trackImage: TrackImage,
) {
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
      .where(eq(products.bar_id, audit.bar_id))
      .all()
      .filter((row) => row.vintage === null)
      .map((row) => [nameKey(row.name), row.id]),
  );
  const pantry = new Map(
    tx
      .select()
      .from(pantryIngredients)
      .where(eq(pantryIngredients.bar_id, audit.bar_id))
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
          country: source.country,
          region: source.region,
          // Catalogue bottles are examples to discover, not bottles the bar has bought: no status.
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
      trackImage(pantryPictureKey(source.kind, source.path, name), "pantry-ingredients", id);
      sources.set(source.key, { pantry_ingredient_id: id });
    }
  }
  return sources;
}

function attachCatalogueImages(
  tx: Tx,
  barId: string,
  staged: ReadonlyMap<string, StagedImage>,
  targets: ReadonlyMap<string, ImageTarget>,
) {
  const used = new Set<string>();
  for (const [key, image] of staged) {
    const target = targets.get(key);
    if (target && findOwnerImage(tx, target.entity, barId, target.id)?.image_id === null) {
      if (!used.has(image.id)) insertImage(tx, image);
      setOwnerImage(tx, target.entity, barId, target.id, image.id);
      used.add(image.id);
    }
  }
  return used;
}

function insertCatalogue(
  tx: Tx,
  barId: string,
  userId: string,
  catalogue: Catalogue,
  staged: ReadonlyMap<string, StagedImage>,
) {
  const targets = new Map<string, ImageTarget>();
  const trackImage = (key: string, entity: ImageEntity, id: string) => {
    if (staged.has(key)) targets.set(key, { entity, id });
  };
  const audit = { bar_id: barId, created_by: userId };
  const categories = catalogueCategoryLookup(
    tx,
    audit,
    catalogue.existingRootPictureKinds,
    trackImage,
  );
  const sources = importSources(tx, audit, catalogue, categories, trackImage);
  const barUtensils = new Map(
    tx
      .select()
      .from(utensils)
      .where(eq(utensils.bar_id, barId))
      .all()
      .map(({ id, name, kind }) => [nameKey(name), { id, kind }]),
  );
  function ensureUtensil(name: string, kind: UtensilKind) {
    const slot = availableName(
      name,
      kind,
      (candidate) => barUtensils.get(nameKey(candidate)),
      (row) => row.kind,
    );
    const id = slot.existing?.id ?? insertUtensil(tx, { ...audit, kind, name: slot.name });
    barUtensils.set(nameKey(slot.name), { id, kind });
    trackImage(`${kind}:${name}`, "utensils", id);
    return id;
  }

  for (const name of catalogue.glassware ?? []) ensureUtensil(name, "glass");
  const toolIds = new Map(
    (catalogue.tools ?? []).map((name) => [nameKey(name), ensureUtensil(name, "tool")]),
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
    const glass_id = ensureUtensil(recipe.glass, "glass");
    const existingId = existing.get(key);
    if (existingId) {
      trackImage(`cocktail:${recipe.id}`, "cocktails", existingId);
      continue;
    }
    const input = importedCocktailSchema.parse({
      ...recipe,
      glass_id,
      tool_ids: (recipe.tools ?? []).map((name) => required(toolIds, nameKey(name))),
      steps: recipe.steps.map((value) => ({ text: value })),
      ingredients: recipe.ingredients.map(({ ref, alternatives, ...quantity }) => ({
        ...quantity,
        ...required(sources, ref),
        alternatives: alternatives?.map(({ ref, note }) => ({ ...required(sources, ref), note })),
      })),
    });
    const { ingredients, steps, tool_ids, ...cocktail } = input;
    const { id } = insertCocktail(tx, {
      ...audit,
      ...cocktail,
    });
    insertIngredients(tx, barId, userId, id, ingredients);
    const recipeOwner = { ...audit, cocktail_id: id };
    insertSteps(tx, recipeOwner, steps);
    insertTools(tx, recipeOwner, tool_ids);
    existing.set(key, id);
    trackImage(`cocktail:${recipe.id}`, "cocktails", id);
  }
  return attachCatalogueImages(tx, barId, staged, targets);
}

/** Applies a catalogue and records its version in the same transaction. */
export function applyCatalogue(
  tx: Tx,
  barId: string,
  userId: string,
  catalogue: Catalogue,
  staged: ReadonlyMap<string, StagedImage>,
) {
  const attached = insertCatalogue(tx, barId, userId, catalogue, staged);
  tx.insert(barDataMigrations).values({ bar_id: barId, migration: catalogue.id }).run();
  return attached;
}

/** Reuse staged files for shared prepared artwork and clean up unattached images. */
export async function withCataloguePictures(
  ctx: Pick<Ctx, "barId" | "userId" | "storage">,
  pictures: Catalogue["pictures"],
  apply: (staged: ReadonlyMap<string, StagedImage>) => ReadonlySet<string>,
) {
  const staged = new Map<string, StagedImage>();
  const preparedPictures = new Map<ProcessedImage, StagedImage>();
  let used: ReadonlySet<string> = new Set();
  try {
    for (const [key, picture] of pictures ?? []) {
      const prepared = !(picture instanceof Uint8Array);
      const pending = prepared
        ? (preparedPictures.get(picture) ?? stagePreparedImage(ctx, picture))
        : stageImage(ctx, picture, {
            thumbnailSide: key.startsWith("cocktail:") ? COCKTAIL_THUMB_MAX_SIDE : undefined,
          });
      // Stage one image at a time to bound encoding and file writes during catalogue import.
      const image = await pending; // NOSONAR
      if (prepared) preparedPictures.set(picture, image);
      staged.set(key, image);
    }
    used = apply(staged);
  } finally {
    await Promise.all(
      [...new Set(staged.values())]
        .filter(({ id }) => !used.has(id))
        .map((image) => removeImageFiles(ctx.storage, image)),
    );
  }
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

  await withCataloguePictures(
    { barId, userId: bar.owner_id, storage },
    catalogue.pictures,
    (staged) =>
      db.transaction(
        (tx) => {
          if (tx.select().from(barDataMigrations).where(record).get()) return new Set<string>();
          return applyCatalogue(tx, barId, bar.owner_id, catalogue, staged);
        },
        { behavior: "immediate" },
      ),
  );
}
