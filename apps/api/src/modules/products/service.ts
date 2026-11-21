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
import {
  type AppError,
  conflict,
  invalid,
  notFound,
  parseId,
  refuseDeleteIfUsed,
} from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { findCategory, listAllCategories } from "../categories/repo.ts";
import { requireCategoryRef } from "../categories/service.ts";
import { listIngredientUsage } from "../cocktails/ingredients-repo.ts";
import { setFavourite as saveFavourite } from "../favourites/repo.ts";
import { deleteWithImage } from "../images/service.ts";
import {
  deleteHiddenOrphanedTastings,
  hasTastingUsage,
  listTastingUsage,
} from "../tastings/repo.ts";
import { listPurchaseUsage } from "./purchases-repo.ts";
import type { Viewer } from "./repo.ts";
import * as repo from "./repo.ts";

/** `GET /products`: a page sorted by name. A category filter includes its sub-categories. */
export function listProducts(ctx: Ctx, query: ListProductsQuery): Page<Product> {
  const categoryIds =
    query.category_id === undefined
      ? undefined
      : [...subtreeIds(listAllCategories(ctx.db, ctx.barId), query.category_id)];
  const rows = repo.listProducts(ctx.db, ctx, {
    q: query.q,
    categoryIds,
    statuses: query.status,
    country: query.country,
    favourite: query.favourite,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

/** The bottle as shown to `viewer`; use `requireProductRef` when only its existence matters. */
export function requireProduct(db: Executor, viewer: Viewer, id: string | undefined): Product {
  const product = repo.findProduct(db, viewer, parseId(id, "Product"));
  if (!product) throw notFound("Product");
  return product;
}

/** The bottle's id and name, when it is in the bar: a cheap check for writes about the bottle. */
export function requireProductRef(
  db: Executor,
  barId: string,
  id: string | undefined,
): { id: string; name: string } {
  const product = repo.findProductRef(db, barId, parseId(id, "Product"));
  if (!product) throw notFound("Product");
  return product;
}

/** The duplicate is reported on the `name` field, so forms can show it there. */
const duplicateName = (name: string, vintage: number | null) => (): AppError => {
  const message =
    vintage === null
      ? `A bottle named "${name}" already exists`
      : `A ${vintage} bottle named "${name}" already exists`;
  return conflict(message, [{ path: ["name"], message }]);
};

export function getProduct(ctx: Ctx, id: string | undefined): Product {
  return requireProduct(ctx.db, ctx, id);
}

function requireBottleCategory(db: Executor, barId: string, categoryId: string): void {
  const category = requireCategoryRef(db, barId, categoryId);
  if (
    !isBottleCategory(category, {
      get: (id: string) => (id === category.id ? category : findCategory(db, barId, id)),
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
    return requireProduct(tx, ctx, id);
  });
}

export function updateProduct(ctx: Ctx, id: string | undefined, patch: UpdateProduct): Product {
  return ctx.db.transaction((tx) => {
    const existing = requireProduct(tx, ctx, id);
    if (patch.category_id && patch.category_id !== existing.category_id) {
      requireBottleCategory(tx, ctx.barId, patch.category_id);
    }
    const name = patch.name ?? existing.name;
    const vintage = patch.vintage === undefined ? existing.vintage : patch.vintage;
    onUniqueViolation(
      () => repo.updateProduct(tx, ctx.barId, existing.id, patch),
      duplicateName(name, vintage),
    );
    return requireProduct(tx, ctx, existing.id);
  });
}

/**
 * Deletes the bottle if no cocktail uses it and it has no purchase or tasting records. The owner's
 * delete also removes private tastings by people who can no longer write in the bar.
 */
export async function deleteProduct(ctx: Ctx, id: string | undefined): Promise<void> {
  await deleteWithImage(ctx, (tx) => {
    const existing = requireProduct(tx, ctx, id);
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
      {
        type: "tasting",
        label: "tastings",
        rows: listTastingUsage(tx, ctx.barId, ctx.userId, existing.id),
      },
    ]);
    // Hidden tastings by people who can no longer write would lock the bottle for good.
    if (ctx.role === "owner") deleteHiddenOrphanedTastings(tx, ctx.barId, ctx.userId, existing.id);
    // Other private tastings still protect the bottle without exposing their IDs or dates.
    if (hasTastingUsage(tx, ctx.barId, existing.id)) {
      throw conflict(`"${existing.name}" is still in use`);
    }
    repo.deleteProduct(tx, ctx.barId, existing.id);
    return existing.image_id;
  });
}

/** `PUT`/`DELETE /products/:id/favourite`: personal, so any member may set it. */
export function setFavourite(ctx: Ctx, id: string | undefined, favourite: boolean): void {
  ctx.db.transaction((tx) => {
    const product = requireProductRef(tx, ctx.barId, id);
    saveFavourite(tx, ctx.barId, ctx.userId, "product_id", product.id, favourite);
  });
}
