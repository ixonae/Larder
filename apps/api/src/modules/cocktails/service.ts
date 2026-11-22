import {
  ALCOHOL_KINDS,
  buildInventory,
  type Category,
  type CategoryKind,
  type Cocktail,
  type CocktailDetail,
  type CocktailMethod,
  type CocktailRecipeLists,
  type ComputedCocktail,
  type CreateCocktail,
  computeAbv,
  computeVolume,
  type Inventory,
  type ListCocktailsQuery,
  type ListTagsQuery,
  MIXER_KINDS,
  makeability,
  matchingBottles,
  type Page,
  scaleRecipe,
  spiritsContained,
  subtreeIds,
  type Tag,
  type UpdateCocktail,
  type UtensilKind,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { type AppError, conflict, invalid, refuseDeleteIfUsed } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { listAllCategories } from "../categories/repo.ts";
import { favouriteIds } from "../favourites/repo.ts";
import { deleteWithImage } from "../images/service.ts";
import { listAvailablePantryIngredientIds } from "../pantry/repo.ts";
import { listOwnedProducts } from "../products/repo.ts";
import { findUtensil } from "../utensils/repo.ts";
import { type PersonalSummary, personalSummaries } from "./feedback.ts";
import { listRatings } from "./feedback-repo.ts";
import {
  addAlternatives,
  getAlternatives,
  getPreferredIngredients,
  ingredientResolver,
  type PreferredIngredient,
  replaceIngredients,
} from "./ingredients.ts";
import * as recipeRepo from "./recipe-repo.ts";
import * as repo from "./repo.ts";
import { type CocktailRow, requireCocktail } from "./require-cocktail.ts";

function summarize(
  lines: PreferredIngredient[],
  method: CocktailMethod,
  measuredLines: PreferredIngredient[] = lines,
): ComputedCocktail {
  return {
    volume_ml: computeVolume(measuredLines),
    abv: computeAbv(lines, method),
    spirits: spiritsContained(lines),
    ingredients: lines.filter((line) => !line.preparation_only).map(({ name }) => name),
  };
}

/** What recipes can use from owned bottles, always-available categories and the Pantry. */
const loadInventory = (db: Executor, barId: string, categories: Category[]): Inventory =>
  buildInventory(
    categories,
    listOwnedProducts(db, barId),
    listAvailablePantryIngredientIds(db, barId),
  );

function ingredientGroups(
  categories: Category[],
  ids: string[] | undefined,
  kinds: ReadonlySet<CategoryKind>,
): string[][] {
  return (ids ?? []).map((id) => {
    const family = subtreeIds(categories, id);
    return categories
      .filter((item) => kinds.has(item.kind) && family.has(item.id))
      .map((item) => item.id);
  });
}

export function listCocktails(
  { db, barId, userId }: Ctx,
  query: ListCocktailsQuery,
): Page<Cocktail> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  // Makeability is computed here, so that filter reads every candidate before paging.
  const filtered = query.missing !== undefined;
  return db.transaction((tx) => {
    const categories = listAllCategories(tx, barId);
    // Each chosen category stands for itself and its descendants of the right kinds.
    const ingredientCategories = [
      ...ingredientGroups(categories, query.alcohol, ALCOHOL_KINDS),
      ...ingredientGroups(categories, query.mixer, MIXER_KINDS),
    ];
    const rows = repo.listCocktails(
      tx,
      barId,
      { ...query, limit: filtered ? undefined : query.limit + 1 },
      after,
      ingredientCategories,
      userId,
    );
    if (rows.length === 0) return { items: [], next_cursor: null };
    const ids = rows.map(({ id }) => id);
    const preferred = getPreferredIngredients(tx, barId, ids, ingredientResolver(categories));
    const alternatives = getAlternatives(tx, barId, ids);
    const inventory = loadInventory(tx, barId, categories);
    const linesOf = (id: string) => preferred.get(id) ?? [];
    const kept = rows
      .map((cocktail) => {
        const lines = linesOf(cocktail.id).map((line) => ({
          ...line,
          alternatives: alternatives.get(line.id) ?? [],
        }));
        return { ...cocktail, missing: makeability(lines, inventory) };
      })
      .filter(({ missing }) => !filtered || missing.length === query.missing);
    const page = toPage(kept, query.limit);
    // Only the cocktails on the page need the rest of their computed values.
    const personal: (id: string) => PersonalSummary = personalSummaries(
      tx,
      barId,
      userId,
      page.items.map(({ id }) => id),
    );
    return {
      ...page,
      items: page.items.map((cocktail) => ({
        ...cocktail,
        ...personal(cocktail.id),
        computed: summarize(linesOf(cocktail.id), cocktail.method),
      })),
    };
  });
}

export function listTags(ctx: Ctx, query: ListTagsQuery): Page<Tag> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  return toPage(
    recipeRepo.listTags(ctx.db, ctx.barId, { ...query, limit: query.limit + 1 }, after),
    query.limit,
  );
}

function requireUtensilKind(
  db: Executor,
  barId: string,
  id: string,
  kind: UtensilKind,
  path: (string | number)[],
): void {
  if (findUtensil(db, barId, id)?.kind !== kind) {
    const message = `Choose a ${kind} from this bar`;
    throw invalid(message, [{ path, message }]);
  }
}

function validateReferences(db: Executor, barId: string, input: UpdateCocktail, id?: string): void {
  if (input.glass_id) requireUtensilKind(db, barId, input.glass_id, "glass", ["glass_id"]);
  let parentId = input.variant_of_id;
  while (parentId) {
    const parent = repo.findCocktail(db, barId, parentId);
    if (!parent || parent.id === id) {
      const message = "Choose a cocktail from this bar outside this variant chain";
      throw invalid(message, [{ path: ["variant_of_id"], message }]);
    }
    parentId = parent.variant_of_id;
  }
}

const duplicateName = (name: string) => (): AppError => {
  const message = `A cocktail named "${name}" already exists`;
  return conflict(message, [{ path: ["name"], message }]);
};

/** The personal summary and other members' ratings of one cocktail, from a single ratings read. */
function ratingDetail(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
): PersonalSummary & Pick<CocktailDetail, "other_ratings"> {
  const all = listRatings(db, barId, cocktailId);
  const mine = all.find(({ user }) => user.id === userId);
  return {
    my_rating: mine ? { score: mine.score, updated_at: mine.updated_at } : null,
    avg_rating: all[0]?.avg ?? null,
    rating_count: all.length,
    is_favourite: favouriteIds(db, barId, userId, "cocktail_id", [cocktailId]).has(cocktailId),
    other_ratings: all
      .filter(({ user }) => user.id !== userId)
      .map(({ avg: _, ...rating }) => rating),
  };
}

function detail(
  db: Executor,
  barId: string,
  userId: string,
  cocktail: CocktailRow,
  servings: number = cocktail.servings,
): CocktailDetail {
  const categories = listAllCategories(db, barId);
  const resolve = ingredientResolver(categories);
  const lines = getPreferredIngredients(db, barId, [cocktail.id], resolve).get(cocktail.id) ?? [];
  const scaled =
    servings === cocktail.servings ? lines : scaleRecipe(lines, cocktail.servings, servings);
  if (
    scaled !== lines &&
    scaled.some(({ amount }) => amount !== null && (!Number.isFinite(amount) || amount === 0))
  ) {
    const message = "Choose a serving count that keeps ingredient amounts in range";
    throw invalid(message, [{ path: ["servings"], message }]);
  }
  const inventory = loadInventory(db, barId, categories);
  const ingredients = addAlternatives(
    scaled,
    getAlternatives(db, barId, [cocktail.id]),
    resolve,
    (source) => matchingBottles(source, inventory),
  );
  return {
    ...cocktail,
    ...ratingDetail(db, barId, userId, cocktail.id),
    servings,
    computed: summarize(lines, cocktail.method, scaled),
    missing: makeability(ingredients, inventory),
    ingredients,
    steps: recipeRepo.listSteps(db, barId, cocktail.id),
    tools: recipeRepo.listTools(db, barId, cocktail.id),
    tags: recipeRepo.listCocktailTags(db, barId, cocktail.id),
  };
}

export function getCocktail(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  servings: number | undefined,
): CocktailDetail {
  return db.transaction((tx) =>
    detail(tx, barId, userId, requireCocktail(tx, barId, id), servings),
  );
}

function replaceRecipeLists(
  db: Executor,
  barId: string,
  userId: string,
  id: string,
  { ingredients, steps, tool_ids, tags }: CocktailRecipeLists,
): void {
  const owner = { bar_id: barId, created_by: userId, cocktail_id: id };
  if (ingredients !== undefined) replaceIngredients(db, barId, userId, id, ingredients);
  if (steps !== undefined) recipeRepo.replaceSteps(db, owner, steps);
  if (tool_ids !== undefined) {
    for (const [index, toolId] of tool_ids.entries()) {
      requireUtensilKind(db, barId, toolId, "tool", ["tool_ids", index]);
    }
    recipeRepo.replaceTools(db, owner, tool_ids);
  }
  if (tags !== undefined) recipeRepo.replaceTags(db, owner, tags);
}

export function createCocktail(
  { db, barId, userId }: Ctx,
  { ingredients, steps, tool_ids, tags, ...input }: CreateCocktail,
): CocktailDetail {
  return db.transaction((tx) => {
    validateReferences(tx, barId, input);
    const cocktail = onUniqueViolation(
      () => repo.insertCocktail(tx, { ...input, bar_id: barId, created_by: userId }),
      duplicateName(input.name),
    );
    replaceRecipeLists(tx, barId, userId, cocktail.id, { ingredients, steps, tool_ids, tags });
    return detail(tx, barId, userId, cocktail);
  });
}

export function updateCocktail(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  { ingredients, steps, tool_ids, tags, ...patch }: UpdateCocktail,
): CocktailDetail {
  return db.transaction((tx) => {
    const existing = requireCocktail(tx, barId, id);
    validateReferences(tx, barId, patch, existing.id);
    const cocktail = onUniqueViolation(
      () => repo.updateCocktail(tx, barId, existing.id, patch),
      duplicateName(patch.name ?? existing.name),
    );
    replaceRecipeLists(tx, barId, userId, cocktail.id, { ingredients, steps, tool_ids, tags });
    return detail(tx, barId, userId, cocktail);
  });
}

export async function deleteCocktail(ctx: Ctx, id: string | undefined): Promise<void> {
  await deleteWithImage(ctx, (tx) => {
    const existing = requireCocktail(tx, ctx.barId, id);
    refuseDeleteIfUsed(existing.name, [
      {
        type: "cocktail",
        label: "variants",
        rows: repo.listCocktailReferences(tx, ctx.barId, "variant_of_id", existing.id),
      },
    ]);
    repo.deleteCocktail(tx, ctx.barId, existing.id);
    return existing.image_id;
  });
}
