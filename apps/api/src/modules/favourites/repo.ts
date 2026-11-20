import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { favourites } from "../../db/schema/index.ts";

/** What a favourite points at: a bottle or a cocktail. */
export type FavouriteTarget = "product_id" | "cocktail_id";
const TABLES: Record<FavouriteTarget, string> = {
  product_id: "products",
  cocktail_id: "cocktails",
};

/**
 * Whether the bottle or cocktail row in scope is one of `userId`'s favourites. Written with
 * qualified names: drizzle drops them in single-table selects, which would break the correlation.
 */
export function isFavourite(target: FavouriteTarget, userId: string): SQL<boolean> {
  const table = sql.raw(TABLES[target]);
  return sql<boolean>`exists (select 1 from favourites f where f.bar_id = ${table}.bar_id and f.created_by = ${userId} and f.${sql.raw(target)} = ${table}.id)`.mapWith(
    Boolean,
  );
}

/** Which of `ids` are `userId`'s favourites. */
export function favouriteIds(
  db: Executor,
  barId: string,
  userId: string,
  target: FavouriteTarget,
  ids: string[],
): Set<string> {
  return new Set(
    db
      .select({ id: favourites[target] })
      .from(favourites)
      .where(
        and(
          eq(favourites.bar_id, barId),
          eq(favourites.created_by, userId),
          inArray(favourites[target], ids),
        ),
      )
      .all()
      .map(({ id }) => id as string),
  );
}

/** Adds or removes a favourite; doing it twice changes nothing. */
export function setFavourite(
  db: Executor,
  barId: string,
  userId: string,
  target: FavouriteTarget,
  id: string,
  favourite: boolean,
): void {
  if (favourite) {
    db.insert(favourites)
      .values({ bar_id: barId, created_by: userId, [target]: id })
      .onConflictDoNothing()
      .run();
  } else {
    db.delete(favourites)
      .where(
        and(
          eq(favourites.bar_id, barId),
          eq(favourites.created_by, userId),
          eq(favourites[target], id),
        ),
      )
      .run();
  }
}
