import type {
  Cocktail,
  CocktailDetail,
  CreateCocktail,
  ListCocktailsQuery,
  Page,
  UpdateCocktail,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { conflict, invalid, notFound, parseId, refuseDeleteIfUsed } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { deleteWithImage } from "../images/service.ts";
import { findUtensil } from "../utensils/repo.ts";
import { getIngredients, replaceIngredients } from "./ingredients.ts";
import * as repo from "./repo.ts";

export function listCocktails(ctx: Ctx, query: ListCocktailsQuery): Page<Cocktail> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  return toPage(
    repo.listCocktails(ctx.db, ctx.barId, { ...query, limit: query.limit + 1 }, after),
    query.limit,
  );
}

function requireCocktail(db: Executor, barId: string, id: string | undefined): Cocktail {
  const cocktail = repo.findCocktail(db, barId, parseId(id, "Cocktail"));
  if (!cocktail) throw notFound("Cocktail");
  return cocktail;
}

function validateReferences(db: Executor, barId: string, input: UpdateCocktail, id?: string) {
  if (input.glass_id && findUtensil(db, barId, input.glass_id)?.kind !== "glass") {
    const message = "Choose a glass from this bar";
    throw invalid(message, [{ path: ["glass_id"], message }]);
  }
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
  return { ...cocktail, ingredients: getIngredients(db, barId, cocktail.id) };
}

export function getCocktail(ctx: Ctx, id: string | undefined): CocktailDetail {
  return ctx.db.transaction((tx) => detail(tx, ctx.barId, requireCocktail(tx, ctx.barId, id)));
}

export function createCocktail(
  { db, barId, userId }: Ctx,
  { ingredients, ...input }: CreateCocktail,
): CocktailDetail {
  return db.transaction((tx) => {
    validateReferences(tx, barId, input);
    const cocktail = onUniqueViolation(
      () => repo.insertCocktail(tx, { ...input, bar_id: barId, created_by: userId }),
      duplicateName(input.name),
    );
    if (ingredients !== undefined) replaceIngredients(tx, barId, userId, cocktail.id, ingredients);
    return detail(tx, barId, cocktail);
  });
}

export function updateCocktail(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  { ingredients, ...patch }: UpdateCocktail,
): CocktailDetail {
  return db.transaction((tx) => {
    const existing = requireCocktail(tx, barId, id);
    validateReferences(tx, barId, patch, existing.id);
    const cocktail = onUniqueViolation(
      () => repo.updateCocktail(tx, barId, existing.id, patch),
      duplicateName(patch.name ?? existing.name),
    );
    if (ingredients !== undefined) replaceIngredients(tx, barId, userId, cocktail.id, ingredients);
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
