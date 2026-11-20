import {
  type CreatePurchase,
  type CurrencyCode,
  type FinishProduct,
  type Product,
  type Purchase,
  type PurchaseList,
  todayIso,
  type UpdatePurchase,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { invalid, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import * as repo from "./purchases-repo.ts";
import { updateProduct } from "./repo.ts";
import { requireProduct } from "./service.ts";

function requirePurchase(db: Executor, barId: string, productId: string, id: string | undefined) {
  const purchase = repo.findPurchase(db, barId, productId, parseId(id, "Purchase"));
  if (!purchase) throw notFound("Purchase");
  return purchase;
}

/** A bottle cannot run out before it was bought; reported on `finished_on` for forms. */
function requireFinishAfterPurchase(bought_on: string, finished_on: string | null) {
  if (finished_on !== null && finished_on < bought_on) {
    const message = "A bottle cannot run out before the day it was bought";
    throw invalid(message, [{ path: ["finished_on"], message }]);
  }
}

const setStatus = (db: Executor, barId: string, id: string, status: Product["status"]) =>
  updateProduct(db, barId, id, { status });

/** After a bottle ran out or was removed: with purchases left but none open, it is finished. */
function finishIfNoneOpen(db: Executor, barId: string, productId: string) {
  const { stock } = requireProduct(db, barId, productId);
  if (stock.total_count > 0 && stock.open_count === 0) {
    setStatus(db, barId, productId, "finished");
  }
}

/** The price and its currency, together: no price means no currency. */
function price(
  price_minor: number | null | undefined,
  currency: CurrencyCode | null | undefined,
  fallback: CurrencyCode,
) {
  if (price_minor === null || price_minor === undefined) {
    return { price_minor: null, currency: null };
  }
  return { price_minor, currency: currency ?? fallback };
}

export function listPurchases(ctx: Ctx, productId: string | undefined): PurchaseList {
  const product = requireProduct(ctx.db, ctx.barId, productId);
  return { items: repo.listPurchases(ctx.db, ctx.barId, product.id) };
}

/** Records `count` identical bottles (price per bottle) and puts the bottle in the bar. */
export function createPurchases(
  ctx: Ctx,
  productId: string | undefined,
  { count, price_minor, currency, ...input }: CreatePurchase,
): PurchaseList {
  return ctx.db.transaction((tx) => {
    const product = requireProduct(tx, ctx.barId, productId);
    const row = {
      ...input,
      ...price(price_minor, currency, ctx.currency),
      bar_id: ctx.barId,
      created_by: ctx.userId,
      product_id: product.id,
    };
    const items = repo.insertPurchases(tx, Array(count).fill(row));
    setStatus(tx, ctx.barId, product.id, "owned");
    return { items };
  });
}

/**
 * Edits a purchase. Clearing `finished_on` reopens the bottle (status `owned`); setting it on the
 * last open bottle finishes it, as `POST /finish` would.
 */
export function updatePurchase(
  ctx: Ctx,
  productId: string | undefined,
  id: string | undefined,
  patch: UpdatePurchase,
): Purchase {
  return ctx.db.transaction((tx) => {
    const product = requireProduct(tx, ctx.barId, productId);
    const existing = requirePurchase(tx, ctx.barId, product.id, id);
    const { price_minor, currency, ...rest } = patch;
    const merged = { ...existing, ...rest };
    requireFinishAfterPurchase(merged.bought_on, merged.finished_on);
    const prices =
      price_minor === undefined && currency === undefined
        ? {}
        : price(
            price_minor === undefined ? existing.price_minor : price_minor,
            currency ?? existing.currency,
            ctx.currency,
          );
    const saved = repo.updatePurchase(tx, ctx.barId, existing.id, { ...rest, ...prices });
    if (existing.finished_on !== null && merged.finished_on === null) {
      setStatus(tx, ctx.barId, product.id, "owned");
    } else if (existing.finished_on === null && merged.finished_on !== null) {
      finishIfNoneOpen(tx, ctx.barId, product.id);
    }
    return saved;
  });
}

/**
 * Removes a purchase. Removing the last open bottle while finished ones remain finishes the bottle;
 * removing a finished one never changes the status.
 */
export function deletePurchase(ctx: Ctx, productId: string | undefined, id: string | undefined) {
  ctx.db.transaction((tx) => {
    const product = requireProduct(tx, ctx.barId, productId);
    const existing = requirePurchase(tx, ctx.barId, product.id, id);
    repo.deletePurchase(tx, ctx.barId, existing.id);
    if (existing.finished_on === null) finishIfNoneOpen(tx, ctx.barId, product.id);
  });
}

/**
 * "Ran out": closes the oldest open bottle. The bottle is finished once none is open; without any
 * purchase record it is simply marked finished.
 */
export function finishProduct(
  ctx: Ctx,
  productId: string | undefined,
  { finished_on = todayIso() }: FinishProduct,
): Product {
  return ctx.db.transaction((tx) => {
    const product = requireProduct(tx, ctx.barId, productId);
    const oldest = repo.findOldestOpenPurchase(tx, ctx.barId, product.id);
    if (oldest) {
      requireFinishAfterPurchase(oldest.bought_on, finished_on);
      repo.updatePurchase(tx, ctx.barId, oldest.id, { finished_on });
      finishIfNoneOpen(tx, ctx.barId, product.id);
    } else {
      setStatus(tx, ctx.barId, product.id, "finished");
    }
    return requireProduct(tx, ctx.barId, product.id);
  });
}
