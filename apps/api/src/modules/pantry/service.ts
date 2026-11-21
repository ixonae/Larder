import {
  type CreatePantryIngredient,
  isPantryCategoryKind,
  type ListPantryIngredientsQuery,
  type Page,
  type PantryIngredient,
  subtreeIds,
  type UpdatePantryIngredient,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import {
  type AppError,
  conflict,
  invalid,
  notFound,
  parseId,
  refuseDeleteIfUsed,
} from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { listAllCategories } from "../categories/repo.ts";
import { requireCategoryRef } from "../categories/service.ts";
import { listIngredientUsage } from "../cocktails/ingredients-repo.ts";
import { deleteWithImage } from "../images/service.ts";
import * as repo from "./repo.ts";

/** `GET /pantry-ingredients`: a page sorted by name. A category filter includes its sub-categories. */
export function listPantryIngredients(
  ctx: Ctx,
  query: ListPantryIngredientsQuery,
): Page<PantryIngredient> {
  const categoryIds =
    query.category_id === undefined
      ? undefined
      : [...subtreeIds(listAllCategories(ctx.db, ctx.barId), query.category_id)];
  const rows = repo.listPantryIngredients(ctx.db, ctx.barId, {
    q: query.q,
    categoryIds,
    available: query.available,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

function requireIngredient(db: Executor, barId: string, id: string | undefined): PantryIngredient {
  const ingredient = repo.findPantryIngredient(db, barId, parseId(id, "Ingredient"));
  if (!ingredient) throw notFound("Ingredient");
  return ingredient;
}

/** The duplicate is reported on the `name` field, so forms can show it there. */
const duplicateName = (name: string) => (): AppError => {
  const message = `An ingredient named "${name}" already exists in this category`;
  return conflict(message, [{ path: ["name"], message }]);
};

export function getPantryIngredient(ctx: Ctx, id: string | undefined): PantryIngredient {
  return requireIngredient(ctx.db, ctx.barId, id);
}

function requirePantryCategory(db: Executor, barId: string, categoryId: string): void {
  const category = requireCategoryRef(db, barId, categoryId);
  if (!isPantryCategoryKind(category.kind)) {
    const message = "Choose a category for pantry ingredients";
    throw invalid(message, [{ path: ["category_id"], message }]);
  }
}

export function createPantryIngredient(ctx: Ctx, input: CreatePantryIngredient): PantryIngredient {
  return ctx.db.transaction((tx) => {
    requirePantryCategory(tx, ctx.barId, input.category_id);
    // Flags left out take the column defaults (false).
    const id = onUniqueViolation(
      () =>
        repo.insertPantryIngredient(tx, { ...input, bar_id: ctx.barId, created_by: ctx.userId }),
      duplicateName(input.name),
    );
    return requireIngredient(tx, ctx.barId, id);
  });
}

export function updatePantryIngredient(
  ctx: Ctx,
  id: string | undefined,
  patch: UpdatePantryIngredient,
): PantryIngredient {
  return ctx.db.transaction((tx) => {
    const existing = requireIngredient(tx, ctx.barId, id);
    if (patch.category_id && patch.category_id !== existing.category_id) {
      requirePantryCategory(tx, ctx.barId, patch.category_id);
    }
    onUniqueViolation(
      () => repo.updatePantryIngredient(tx, ctx.barId, existing.id, patch),
      duplicateName(patch.name ?? existing.name),
    );
    return requireIngredient(tx, ctx.barId, existing.id);
  });
}

/** Deletes the ingredient if no cocktail uses it. */
export async function deletePantryIngredient(ctx: Ctx, id: string | undefined): Promise<void> {
  await deleteWithImage(ctx, (tx) => {
    const existing = requireIngredient(tx, ctx.barId, id);
    refuseDeleteIfUsed(existing.name, [
      {
        type: "cocktail",
        label: "cocktails",
        rows: listIngredientUsage(tx, ctx.barId, "pantry_ingredient_id", existing.id),
      },
    ]);
    repo.deletePantryIngredient(tx, ctx.barId, existing.id);
    return existing.image_id;
  });
}
