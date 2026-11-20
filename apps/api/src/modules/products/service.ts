import {
  type CreateProduct,
  isBottleCategory,
  type ListProductsQuery,
  type Page,
  type Product,
  subtreeIds,
  type UpdateProduct,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { conflict, invalid, notFound, parseId, refuseDeleteIfUsed } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { findCategory, listAllCategories } from "../categories/repo.ts";
import { requireCategoryRef } from "../categories/service.ts";
import { listIngredientUsage } from "../cocktails/ingredients-repo.ts";
import { deleteWithImage } from "../images/service.ts";
import { listPurchaseUsage } from "./purchases-repo.ts";
import * as repo from "./repo.ts";

/** `GET /products`: a page sorted by name. A category filter includes its sub-categories. */
export function listProducts(ctx: Ctx, query: ListProductsQuery): Page<Product> {
  const categoryIds =
    query.category_id === undefined
      ? undefined
      : [...subtreeIds(listAllCategories(ctx.db, ctx.barId), query.category_id)];
  const rows = repo.listProducts(ctx.db, ctx.barId, {
    q: query.q,
    categoryIds,
    statuses: query.status,
    country: query.country,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

export function requireProduct(db: Executor, barId: string, id: string | undefined): Product {
  const product = repo.findProduct(db, barId, parseId(id, "Product"));
  if (!product) throw notFound("Product");
  return product;
}

/** The duplicate is reported on the `name` field, so forms can show it there. */
const duplicateName = (name: string, vintage: number | null) => () => {
  const message =
    vintage === null
      ? `A bottle named "${name}" already exists`
      : `A ${vintage} bottle named "${name}" already exists`;
  return conflict(message, [{ path: ["name"], message }]);
};

export function getProduct(ctx: Ctx, id: string | undefined): Product {
  return requireProduct(ctx.db, ctx.barId, id);
}

function requireBottleCategory(db: Executor, barId: string, categoryId: string) {
  const category = requireCategoryRef(db, barId, categoryId);
  if (
    !isBottleCategory(category, {
      get: (id) => (id === category.id ? category : findCategory(db, barId, id)),
    })
  ) {
    const message = "Choose a bottle category. Track syrups and garnishes in Pantry.";
    throw invalid(message, [{ path: ["category_id"], message }]);
  }
}

export function createProduct(ctx: Ctx, input: CreateProduct): Product {
  return ctx.db.transaction((tx) => {
    requireBottleCategory(tx, ctx.barId, input.category_id);
    // Fields left out take the column defaults: null, including the status.
    const id = onUniqueViolation(
      () => repo.insertProduct(tx, { ...input, bar_id: ctx.barId, created_by: ctx.userId }),
      duplicateName(input.name, input.vintage ?? null),
    );
    return requireProduct(tx, ctx.barId, id);
  });
}

export function updateProduct(ctx: Ctx, id: string | undefined, patch: UpdateProduct): Product {
  return ctx.db.transaction((tx) => {
    const existing = requireProduct(tx, ctx.barId, id);
    if (patch.category_id && patch.category_id !== existing.category_id) {
      requireBottleCategory(tx, ctx.barId, patch.category_id);
    }
    const name = patch.name ?? existing.name;
    const vintage = patch.vintage === undefined ? existing.vintage : patch.vintage;
    onUniqueViolation(
      () => repo.updateProduct(tx, ctx.barId, existing.id, patch),
      duplicateName(name, vintage),
    );
    return requireProduct(tx, ctx.barId, existing.id);
  });
}

/** Deletes the bottle if no cocktail uses it and it has no purchase records. */
export async function deleteProduct(ctx: Ctx, id: string | undefined): Promise<void> {
  await deleteWithImage(ctx, (tx) => {
    const existing = requireProduct(tx, ctx.barId, id);
    refuseDeleteIfUsed(existing.name, [
      {
        type: "cocktail",
        label: "cocktails",
        rows: listIngredientUsage(tx, ctx.barId, "product_id", existing.id),
      },
      {
        type: "purchase",
        label: "purchases",
        rows: listPurchaseUsage(tx, ctx.barId, existing.id),
      },
    ]);
    repo.deleteProduct(tx, ctx.barId, existing.id);
    return existing.image_id;
  });
}
