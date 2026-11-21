import type {
  Comment,
  NewComment,
  Page,
  PaginationQuery,
  Rating,
  RatingInput,
  RatingSummary,
  UpdateComment,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, type NameCursor, toPage } from "../../db/cursor.ts";
import { forbidden, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { deleteFavourite, favouriteIds, insertFavourite } from "../favourites/repo.ts";
import * as feedback from "./feedback-repo.ts";
import { requireCocktail } from "./require-cocktail.ts";

/** What every cocktail carries for the current user: rating summary and favourite flag. */
export type PersonalSummary = RatingSummary & { is_favourite: boolean };

/**
 * The personal summary of any cocktail in `ids` as seen by `userId`. The queries run once, up front;
 * the returned lookup only assembles the result.
 */
export function personalSummaries(
  db: Executor,
  barId: string,
  userId: string,
  ids: string[],
): (id: string) => PersonalSummary {
  const favourites: Set<string> = favouriteIds(db, barId, userId, "cocktail_id", ids);
  const stats: Map<string, feedback.RatingStats> = feedback.ratingStats(db, barId, userId, ids);
  return (id: string): PersonalSummary => {
    const row: feedback.RatingStats | undefined = stats.get(id);
    return {
      my_rating: row?.my_rating ?? null,
      avg_rating: row?.avg_rating ?? null,
      rating_count: row?.rating_count ?? 0,
      is_favourite: favourites.has(id),
    };
  };
}

export function putRating(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  input: RatingInput,
): Rating {
  return db.transaction((tx): Rating => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    return feedback.upsertRating(tx, barId, userId, cocktailId, input);
  });
}

export function removeRating({ db, barId, userId }: Ctx, id: string | undefined): void {
  db.transaction((tx): void => {
    feedback.deleteRating(tx, barId, userId, requireCocktail(tx, barId, id).id);
  });
}

function toComment(row: feedback.CommentRow): Comment {
  return {
    id: row.id,
    cocktail_id: row.cocktail_id,
    body: row.body,
    is_private: row.is_private,
    author: { id: row.created_by, display_name: row.display_name },
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited: row.updated_at > row.created_at,
  };
}

export function listComments(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  query: PaginationQuery,
): Page<Comment> {
  const after: NameCursor | undefined =
    query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  return db.transaction((tx): Page<Comment> => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    const rows: (feedback.CommentRow & { key: string })[] = feedback.listComments(
      tx,
      barId,
      userId,
      cocktailId,
      query.limit + 1,
      after,
    );
    const page: Page<feedback.CommentRow> = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toComment) };
  });
}

export function addComment(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  input: NewComment,
): Comment {
  return db.transaction((tx): Comment => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    const commentId: string = feedback.insertComment(tx, barId, userId, cocktailId, input);
    return toComment(requireComment(tx, barId, cocktailId, userId, commentId));
  });
}

/** A comment the caller may see: another user's private comment does not exist for them. */
function requireComment(
  db: Executor,
  barId: string,
  cocktailId: string,
  userId: string,
  commentId: string | undefined,
): feedback.CommentRow {
  const row: feedback.CommentRow | undefined = feedback.findComment(
    db,
    barId,
    cocktailId,
    parseId(commentId, "Comment"),
  );
  if (!row || (row.created_by !== userId && row.is_private)) throw notFound("Comment");
  return row;
}

/** A visible comment that the caller wrote; someone else's public comment is off-limits. */
function requireAuthoredComment(
  db: Executor,
  barId: string,
  cocktailId: string,
  userId: string,
  commentId: string | undefined,
): feedback.CommentRow {
  const row: feedback.CommentRow = requireComment(db, barId, cocktailId, userId, commentId);
  if (row.created_by !== userId) throw forbidden("Only the author can change this comment");
  return row;
}

export function editComment(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  commentId: string | undefined,
  patch: UpdateComment,
): Comment {
  return db.transaction((tx): Comment => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    const existing: feedback.CommentRow = requireAuthoredComment(
      tx,
      barId,
      cocktailId,
      userId,
      commentId,
    );
    // Saving without a change must not mark the comment as edited.
    const changed: boolean =
      (patch.body !== undefined && patch.body !== existing.body) ||
      (patch.is_private !== undefined && patch.is_private !== existing.is_private);
    if (!changed) return toComment(existing);
    feedback.updateComment(tx, barId, existing.id, patch);
    return toComment(requireComment(tx, barId, cocktailId, userId, existing.id));
  });
}

export function removeComment(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  commentId: string | undefined,
): void {
  db.transaction((tx): void => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    const existing: feedback.CommentRow = requireAuthoredComment(
      tx,
      barId,
      cocktailId,
      userId,
      commentId,
    );
    feedback.deleteComment(tx, barId, existing.id);
  });
}

function changeFavourite(
  { db, barId, userId }: Ctx,
  id: string | undefined,
  write: typeof insertFavourite,
): void {
  db.transaction((tx): void => {
    const cocktailId: string = requireCocktail(tx, barId, id).id;
    write(tx, barId, userId, "cocktail_id", cocktailId);
  });
}

export function addFavourite(ctx: Ctx, id: string | undefined): void {
  changeFavourite(ctx, id, insertFavourite);
}

export function removeFavourite(ctx: Ctx, id: string | undefined): void {
  changeFavourite(ctx, id, deleteFavourite);
}
