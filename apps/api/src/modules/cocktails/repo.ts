import { type ListCocktailsQuery, nowIso } from "@larder/shared";
import { and, eq, exists, getTableColumns, gt, inArray, or, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { cocktails, cocktailTags } from "../../db/schema/index.ts";
import { invalid } from "../../errors.ts";
import { isFavourite } from "../favourites/repo.ts";
import { avgRatingSort } from "./feedback-repo.ts";
import { usesCategories } from "./ingredients-repo.ts";

const { bar_id: _barId, created_by: _createdBy, ...columns } = getTableColumns(cocktails);
/** The cocktail sort key, shared by every list of cocktails. */
export const nameKey: SQL<string> = sql<string>`larder_name_key(${cocktails.name})`;
type CocktailRow = Omit<typeof cocktails.$inferSelect, "bar_id" | "created_by">;

export type NewCocktail = typeof cocktails.$inferInsert;

const byId = (barId: string, id: string): SQL | undefined =>
  and(eq(cocktails.bar_id, barId), eq(cocktails.id, id));

/** Separates the rating from the name key in a `sort=rating` cursor. */
const RATING_SEP = "\u0001";

/** Rows after a `sort=rating` cursor: lower average, then later name key, then later id. */
function afterRating(after: NameCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  // Split at the first separator only: names may contain it, ratings never do.
  const at: number = after.key.indexOf(RATING_SEP);
  const rating: string = after.key.slice(0, at);
  const key: string = after.key.slice(at + 1);
  const avg: number = Number(rating);
  if (at <= 0 || Number.isNaN(avg)) throw invalid("Invalid cursor");
  return or(
    sql`${avgRatingSort} < ${avg}`,
    and(
      sql`${avgRatingSort} = ${avg}`,
      or(sql`${nameKey} > ${key}`, and(sql`${nameKey} = ${key}`, gt(cocktails.id, after.id))),
    ),
  );
}

export function listCocktails(
  db: Executor,
  barId: string,
  /** Without a `limit`, every matching row: for filters applied after the query. */
  {
    q,
    method,
    tag,
    sort,
    favourite,
    limit,
  }: Omit<ListCocktailsQuery, "limit"> & { limit?: number },
  after: NameCursor | undefined,
  /** One list of category IDs per chosen ingredient: a cocktail needs a line in each. */
  ingredientCategories: string[][],
  userId: string,
): (CocktailRow & { key: string })[] {
  const byRating: boolean = sort === "rating";
  const rows = db
    .select({
      ...columns,
      key: nameKey,
      // Only a rating sort needs the average; the cheap constant keeps the row shape the same.
      rating: byRating ? avgRatingSort : sql<number>`0`,
    })
    .from(cocktails)
    .where(
      and(
        eq(cocktails.bar_id, barId),
        q === undefined ? undefined : sql`instr(${nameKey}, larder_name_key(${q})) > 0`,
        method === undefined ? undefined : inArray(cocktails.method, method),
        ...(tag ?? []).map((tagId) =>
          exists(
            db
              .select({ id: cocktailTags.tag_id })
              .from(cocktailTags)
              .where(
                and(
                  eq(cocktailTags.bar_id, barId),
                  eq(cocktailTags.cocktail_id, cocktails.id),
                  eq(cocktailTags.tag_id, tagId),
                ),
              ),
          ),
        ),
        favourite === true ? isFavourite("cocktail_id", userId) : undefined,
        ...ingredientCategories.map((ids) => usesCategories(db, barId, ids)),
        byRating ? afterRating(after) : afterName(nameKey, cocktails.id, after),
      ),
    )
    .orderBy(
      ...(byRating
        ? [sql`${avgRatingSort} desc`, ...byName(nameKey, cocktails.id)]
        : byName(nameKey, cocktails.id)),
    )
    .$dynamic();
  // A rating cursor carries the rating ahead of the name key, so paging resumes at the same spot.
  return (limit === undefined ? rows : rows.limit(limit))
    .all()
    .map(<T extends { rating: number; key: string }>({ rating, ...row }: T) => ({
      ...row,
      key: byRating ? `${rating}${RATING_SEP}${row.key}` : row.key,
    }));
}

export function findCocktail(db: Executor, barId: string, id: string): CocktailRow | undefined {
  return db.select(columns).from(cocktails).where(byId(barId, id)).get();
}

export function insertCocktail(db: Executor, input: NewCocktail): CocktailRow {
  return db.insert(cocktails).values(input).returning(columns).get();
}

export function updateCocktail(
  db: Executor,
  barId: string,
  id: string,
  patch: Partial<NewCocktail>,
): CocktailRow {
  return db
    .update(cocktails)
    .set({ ...patch, updated_at: nowIso() })
    .where(byId(barId, id))
    .returning(columns)
    .get();
}

export function deleteCocktail(db: Executor, barId: string, id: string): void {
  db.delete(cocktails).where(byId(barId, id)).run();
}

export function listCocktailReferences(
  db: Executor,
  barId: string,
  field: "glass_id" | "variant_of_id",
  id: string,
): { id: string; name: string }[] {
  return db
    .select({ id: cocktails.id, name: cocktails.name })
    .from(cocktails)
    .where(and(eq(cocktails.bar_id, barId), eq(cocktails[field], id)))
    .orderBy(...byName(nameKey, cocktails.id))
    .all();
}
