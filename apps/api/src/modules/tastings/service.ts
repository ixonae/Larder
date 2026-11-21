import {
  type CreateTasting,
  hasRole,
  type ListProductTastingsQuery,
  type ListTastingsQuery,
  type Page,
  subtreeIds,
  type Tasting,
  type UpdateTasting,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, type NameCursor, toPage } from "../../db/cursor.ts";
import { forbidden, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { listAllCategories } from "../categories/repo.ts";
import { requireProductRef } from "../products/service.ts";
import * as repo from "./repo.ts";

/**
 * The author deletes their own tasting while they may write in the bar. The owner also deletes
 * tastings by people who no longer can, which nobody else could remove.
 */
const canDelete = ({ userId, role }: Ctx, row: repo.TastingRow): boolean =>
  (row.created_by === userId && hasRole(role, "editor")) ||
  (role === "owner" && !row.author_can_write);

function toTasting(ctx: Ctx, row: repo.TastingRow): Tasting {
  return {
    id: row.id,
    product_id: row.product_id,
    tasted_on: row.tasted_on,
    score: row.score,
    notes: row.notes,
    location: row.location,
    is_private: row.is_private,
    author: { id: row.created_by, display_name: row.display_name },
    product: {
      id: row.product_id,
      name: row.product_name,
      image_id: row.product_image_id,
      category_id: row.category_id,
      category_name: row.category_name,
      status: row.product_status,
    },
    can_delete: canDelete(ctx, row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function page(ctx: Ctx, rows: (repo.TastingRow & { key: string })[], limit: number): Page<Tasting> {
  const result = toPage(rows, limit);
  return { ...result, items: result.items.map((row) => toTasting(ctx, row)) };
}

const after = (cursor: string | undefined): NameCursor | undefined =>
  cursor === undefined ? undefined : decodeCursor(cursor);

/** `GET /tastings`: the bar's journal, newest first. A category filter includes sub-categories. */
export function listTastings(ctx: Ctx, query: ListTastingsQuery): Page<Tasting> {
  const categoryIds =
    query.category_id === undefined
      ? undefined
      : [...subtreeIds(listAllCategories(ctx.db, ctx.barId), query.category_id)];
  const rows = repo.listTastings(ctx.db, ctx.barId, ctx.userId, {
    productId: query.product_id,
    categoryIds,
    scoreMin: query.score_min,
    scoreMax: query.score_max,
    from: query.from,
    to: query.to,
    createdBy: query.mine === true ? ctx.userId : undefined,
    visibility: query.visibility,
    after: after(query.cursor),
    limit: query.limit + 1,
  });
  return page(ctx, rows, query.limit);
}

export function listProductTastings(
  ctx: Ctx,
  id: string | undefined,
  query: ListProductTastingsQuery,
): Page<Tasting> {
  const product = requireProductRef(ctx.db, ctx.barId, id);
  return listTastings(ctx, { ...query, product_id: product.id });
}

function requireTasting(
  db: Executor,
  { barId, userId }: Ctx,
  id: string | undefined,
): repo.TastingRow {
  const row = repo.findTasting(db, barId, userId, parseId(id, "Tasting"));
  if (!row) throw notFound("Tasting");
  return row;
}

/** A tasting the caller wrote: nobody else may change it, not even the bar's owner. */
function requireOwnTasting(ctx: Ctx, db: Executor, id: string | undefined): repo.TastingRow {
  const row = requireTasting(db, ctx, id);
  if (row.created_by !== ctx.userId) throw forbidden("Only the author can change this tasting");
  return row;
}

function requireDeletableTasting(ctx: Ctx, db: Executor, id: string | undefined): repo.TastingRow {
  const row = requireTasting(db, ctx, id);
  if (!canDelete(ctx, row)) throw forbidden("Only the author can delete this tasting");
  return row;
}

export function createTasting(
  ctx: Ctx,
  productId: string | undefined,
  input: CreateTasting,
): Tasting {
  return ctx.db.transaction((tx) => {
    const product = requireProductRef(tx, ctx.barId, productId);
    const id = repo.insertTasting(tx, {
      ...input,
      bar_id: ctx.barId,
      created_by: ctx.userId,
      product_id: product.id,
    });
    return toTasting(ctx, requireTasting(tx, ctx, id));
  });
}

export function updateTasting(ctx: Ctx, id: string | undefined, patch: UpdateTasting): Tasting {
  return ctx.db.transaction((tx) => {
    const existing = requireOwnTasting(ctx, tx, id);
    repo.updateTasting(tx, ctx.barId, existing.id, patch);
    return toTasting(ctx, requireTasting(tx, ctx, existing.id));
  });
}

export function deleteTasting(ctx: Ctx, id: string | undefined): void {
  ctx.db.transaction((tx) => {
    const existing = requireDeletableTasting(ctx, tx, id);
    repo.deleteTasting(tx, ctx.barId, existing.id);
  });
}
