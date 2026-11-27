import type {
  BottleComment,
  ListBottleCommentsQuery,
  NewComment,
  Page,
  UpdateComment,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { forbidden, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { requireProductRef } from "../products/service.ts";
import * as repo from "./repo.ts";

function toComment(row: repo.BottleCommentRow): BottleComment {
  return {
    id: row.id,
    product_id: row.product_id,
    body: row.body,
    is_private: row.is_private,
    author: { id: row.created_by, display_name: row.display_name },
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited: row.updated_at > row.created_at,
  };
}

function requireComment(
  db: Executor,
  { barId, userId }: Ctx,
  productId: string,
  id: string | undefined,
): repo.BottleCommentRow {
  const row = repo.findBottleComment(db, barId, userId, productId, parseId(id, "Comment"));
  if (!row) throw notFound("Comment");
  return row;
}

/** A comment the caller wrote: nobody else may change it, not even the bar's owner. */
function requireOwnComment(
  ctx: Ctx,
  db: Executor,
  productId: string | undefined,
  id: string | undefined,
): repo.BottleCommentRow {
  const product = requireProductRef(db, ctx.barId, productId);
  const row = requireComment(db, ctx, product.id, id);
  if (row.created_by !== ctx.userId) throw forbidden("Only the author can change this comment");
  return row;
}

export function listBottleComments(
  ctx: Ctx,
  productId: string | undefined,
  query: ListBottleCommentsQuery,
): Page<BottleComment> {
  const product = requireProductRef(ctx.db, ctx.barId, productId);
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  const rows = repo.listBottleComments(ctx.db, ctx.barId, ctx.userId, product.id, query, after);
  const page = toPage(rows, query.limit);
  return { ...page, items: page.items.map(toComment) };
}

export function addBottleComment(
  ctx: Ctx,
  productId: string | undefined,
  input: NewComment,
): BottleComment {
  return ctx.write((tx) => {
    const product = requireProductRef(tx, ctx.barId, productId);
    const id = repo.insertBottleComment(tx, {
      bar_id: ctx.barId,
      created_by: ctx.userId,
      product_id: product.id,
      ...input,
    });
    return toComment(requireComment(tx, ctx, product.id, id));
  });
}

export function editBottleComment(
  ctx: Ctx,
  productId: string | undefined,
  id: string | undefined,
  patch: UpdateComment,
): BottleComment {
  return ctx.write((tx) => {
    const existing = requireOwnComment(ctx, tx, productId, id);
    const changed =
      (patch.body !== undefined && patch.body !== existing.body) ||
      (patch.is_private !== undefined && patch.is_private !== existing.is_private);
    if (!changed) return toComment(existing);
    repo.updateBottleComment(tx, ctx.barId, existing.id, patch);
    return toComment(requireComment(tx, ctx, existing.product_id, existing.id));
  });
}

export function removeBottleComment(
  ctx: Ctx,
  productId: string | undefined,
  id: string | undefined,
): void {
  ctx.write((tx) => {
    const existing = requireOwnComment(ctx, tx, productId, id);
    repo.deleteBottleComment(tx, ctx.barId, existing.id);
  });
}
