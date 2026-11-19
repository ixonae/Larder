import type {
  Cocktail,
  CocktailDetail,
  CocktailRecipeLists,
  CreateCocktail,
  ListCocktailsQuery,
  ListTagsQuery,
  Page,
  Tag,
  UpdateCocktail,
  UtensilKind,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { conflict, invalid, notFound, parseId, refuseDeleteIfUsed } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { deleteWithImage } from "../images/service.ts";
import { findUtensil } from "../utensils/repo.ts";
import { getIngredients, replaceIngredients } from "./ingredients.ts";
import * as recipeRepo from "./recipe-repo.ts";
import * as repo from "./repo.ts";

export function listCocktails(ctx: Ctx, query: ListCocktailsQuery): Page<Cocktail> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  return toPage(
    repo.listCocktails(ctx.db, ctx.barId, { ...query, limit: query.limit + 1 }, after),
    query.limit,
  );
}

export function listTags(ctx: Ctx, query: ListTagsQuery): Page<Tag> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  return toPage(
    recipeRepo.listTags(ctx.db, ctx.barId, { ...query, limit: query.limit + 1 }, after),
    query.limit,
  );
}

function requireCocktail(db: Executor, barId: string, id: string | undefined): Cocktail {
  const cocktail = repo.findCocktail(db, barId, parseId(id, "Cocktail"));
  if (!cocktail) throw notFound("Cocktail");
  return cocktail;
}

function requireUtensilKind(
  db: Executor,
  barId: string,
  id: string,
  kind: UtensilKind,
  path: (string | number)[],
) {
  if (findUtensil(db, barId, id)?.kind !== kind) {
    const message = `Choose a ${kind} from this bar`;
    throw invalid(message, [{ path, message }]);
  }
}

function validateReferences(db: Executor, barId: string, input: UpdateCocktail, id?: string) {
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

const duplicateName = (name: string) => () => {
  const message = `A cocktail named "${name}" already exists`;
  return conflict(message, [{ path: ["name"], message }]);
};

function detail(db: Executor, barId: string, cocktail: Cocktail): CocktailDetail {
  return {
    ...cocktail,
    ingredients: getIngredients(db, barId, cocktail.id),
    steps: recipeRepo.listSteps(db, barId, cocktail.id),
    tools: recipeRepo.listTools(db, barId, cocktail.id),
    tags: recipeRepo.listCocktailTags(db, barId, cocktail.id),
  };
}

export function getCocktail(ctx: Ctx, id: string | undefined): CocktailDetail {
  return ctx.db.transaction((tx) => detail(tx, ctx.barId, requireCocktail(tx, ctx.barId, id)));
}

function replaceRecipeLists(
  db: Executor,
  barId: string,
  userId: string,
  id: string,
  { ingredients, steps, tool_ids, tags }: CocktailRecipeLists,
) {
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
    return detail(tx, barId, cocktail);
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
    return detail(tx, barId, cocktail);
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
