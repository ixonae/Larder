import { newId, nowIso, type OtherRating, type Rating, type RatingInput } from "@larder/shared";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { beforeKey, type NameCursor, newestFirst } from "../../db/cursor.ts";
import { comments, ratings, users } from "../../db/schema/index.ts";
import { visibleFeedback } from "../../db/visibility.ts";

/**
 * The rounded average score of a cocktail's ratings; -1 when unrated.
 * Written with qualified names: a single-table select drops them, which would break the correlation.
 */
export const avgRatingSort: SQL<number> = sql<number>`coalesce((
  select round(avg(r.score), 1) from ratings r
  where r.bar_id = cocktails.bar_id and r.cocktail_id = cocktails.id
), -1)`;

export interface RatingStats {
  avg_rating: number | null;
  rating_count: number;
  my_rating: Rating | null;
}

export interface CommentRow {
  id: string;
  cocktail_id: string;
  body: string;
  is_private: boolean;
  created_by: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

const ratingColumns = {
  score: ratings.score,
  updated_at: ratings.updated_at,
};

/** Rating statistics for each of `cocktailIds`; unrated cocktails are absent from the map. */
export function ratingStats(
  db: Executor,
  barId: string,
  userId: string,
  cocktailIds: string[],
): Map<string, RatingStats> {
  // One rating per user and cocktail, so `max` picks the caller's own; NULL when they have not rated.
  const mine = (column: typeof ratings.score | typeof ratings.updated_at): SQL =>
    sql`max(case when ${ratings.created_by} = ${userId} then ${column} end)`;
  return new Map<string, RatingStats>(
    db
      .select({
        cocktail_id: ratings.cocktail_id,
        avg: sql<number>`round(avg(${ratings.score}), 1)`,
        count: sql<number>`count(*)`,
        my_score: sql<number | null>`${mine(ratings.score)}`,
        my_updated_at: sql<string>`${mine(ratings.updated_at)}`,
      })
      .from(ratings)
      .where(and(eq(ratings.bar_id, barId), inArray(ratings.cocktail_id, cocktailIds)))
      .groupBy(ratings.cocktail_id)
      .all()
      .map(
        (row: {
          cocktail_id: string;
          avg: number;
          count: number;
          my_score: number | null;
          my_updated_at: string;
        }): [string, RatingStats] => [
          row.cocktail_id,
          {
            avg_rating: row.avg,
            rating_count: row.count,
            my_rating:
              row.my_score === null ? null : { score: row.my_score, updated_at: row.my_updated_at },
          },
        ],
      ),
  );
}

/** Every rating of a cocktail with its rater, newest first; `avg` is the cocktail's rounded average. */
export function listRatings(
  db: Executor,
  barId: string,
  cocktailId: string,
): (OtherRating & { avg: number })[] {
  return db
    .select({
      id: users.id,
      display_name: users.display_name,
      score: ratings.score,
      updated_at: ratings.updated_at,
      avg: sql<number>`round(avg(${ratings.score}) over (), 1)`,
    })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.created_by))
    .where(and(eq(ratings.bar_id, barId), eq(ratings.cocktail_id, cocktailId)))
    .orderBy(desc(ratings.updated_at), desc(ratings.id))
    .all()
    .map(
      (row: {
        id: string;
        display_name: string;
        score: number;
        updated_at: string;
        avg: number;
      }): OtherRating & { avg: number } => ({
        user: { id: row.id, display_name: row.display_name },
        score: row.score,
        updated_at: row.updated_at,
        avg: row.avg,
      }),
    );
}

export function upsertRating(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  input: RatingInput,
): Rating {
  const now: string = nowIso();
  return db
    .insert(ratings)
    .values({
      id: newId(),
      bar_id: barId,
      created_by: userId,
      cocktail_id: cocktailId,
      created_at: now,
      updated_at: now,
      ...input,
    })
    .onConflictDoUpdate({
      target: [ratings.bar_id, ratings.cocktail_id, ratings.created_by],
      set: { ...input, updated_at: now },
    })
    .returning(ratingColumns)
    .get();
}

export function deleteRating(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
): void {
  db.delete(ratings)
    .where(
      and(
        eq(ratings.bar_id, barId),
        eq(ratings.cocktail_id, cocktailId),
        eq(ratings.created_by, userId),
      ),
    )
    .run();
}

const commentColumns = {
  id: comments.id,
  cocktail_id: comments.cocktail_id,
  body: comments.body,
  is_private: comments.is_private,
  created_by: comments.created_by,
  display_name: users.display_name,
  created_at: comments.created_at,
  updated_at: comments.updated_at,
};

/** Public comments plus the caller's own private ones, newest first; `key` is the cursor's time. */
export function listComments(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  limit: number,
  after: NameCursor | undefined,
): (CommentRow & { key: string })[] {
  return db
    .select({ ...commentColumns, key: comments.created_at })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.created_by))
    .where(
      and(
        eq(comments.bar_id, barId),
        eq(comments.cocktail_id, cocktailId),
        visibleFeedback(comments, userId),
        beforeKey(comments.created_at, comments.id, after),
      ),
    )
    .orderBy(...newestFirst(comments.created_at, comments.id))
    .limit(limit)
    .all();
}

export function findComment(
  db: Executor,
  barId: string,
  cocktailId: string,
  id: string,
): CommentRow | undefined {
  return db
    .select(commentColumns)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.created_by))
    .where(
      and(eq(comments.bar_id, barId), eq(comments.cocktail_id, cocktailId), eq(comments.id, id)),
    )
    .get();
}

export function insertComment(
  db: Executor,
  barId: string,
  userId: string,
  cocktailId: string,
  input: { body: string; is_private: boolean },
): string {
  const now: string = nowIso();
  return db
    .insert(comments)
    .values({
      id: newId(),
      bar_id: barId,
      created_by: userId,
      cocktail_id: cocktailId,
      created_at: now,
      updated_at: now,
      ...input,
    })
    .returning({ id: comments.id })
    .get().id;
}

export function updateComment(
  db: Executor,
  barId: string,
  id: string,
  patch: { body?: string; is_private?: boolean },
): void {
  db.update(comments)
    .set({ ...patch, updated_at: nowIso() })
    .where(and(eq(comments.bar_id, barId), eq(comments.id, id)))
    .run();
}

export function deleteComment(db: Executor, barId: string, id: string): void {
  db.delete(comments)
    .where(and(eq(comments.bar_id, barId), eq(comments.id, id)))
    .run();
}
