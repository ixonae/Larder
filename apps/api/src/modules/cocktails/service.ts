import type {
  Cocktail,
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

export function getCocktail(ctx: Ctx, id: string | undefined): Cocktail {
  return requireCocktail(ctx.db, ctx.barId, id);
}

export function createCocktail({ db, barId, userId }: Ctx, input: CreateCocktail): Cocktail {
  return db.transaction((tx) => {
    validateReferences(tx, barId, input);
    return onUniqueViolation(
      () => repo.insertCocktail(tx, { ...input, bar_id: barId, created_by: userId }),
      duplicateName(input.name),
    );
  });
}

export function updateCocktail(
  { db, barId }: Ctx,
  id: string | undefined,
  patch: UpdateCocktail,
): Cocktail {
  return db.transaction((tx) => {
    const existing = requireCocktail(tx, barId, id);
    validateReferences(tx, barId, patch, existing.id);
    return onUniqueViolation(
      () => repo.updateCocktail(tx, barId, existing.id, patch),
      duplicateName(patch.name ?? existing.name),
    );
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
