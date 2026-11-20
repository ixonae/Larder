import { type CountryCode, NO_STATUS, type Product, type ProductStatus } from "@larder/shared";
import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import {
  bottleComments,
  categories,
  productPurchases,
  products,
  tastings,
} from "../../db/schema/index.ts";
import { visibleFeedback } from "../../db/visibility.ts";
import { isFavourite } from "../favourites/repo.ts";

const columns = {
  id: products.id,
  name: products.name,
  category_id: products.category_id,
  category_name: categories.name,
  producer: products.producer,
  country: products.country,
  region: products.region,
  abv: products.abv,
  vintage: products.vintage,
  age_years: products.age_years,
  description: products.description,
  image_id: products.image_id,
  status: products.status,
  created_at: products.created_at,
  updated_at: products.updated_at,
};

const nameKey = sql<string>`larder_name_key(${products.name})`;

export type NewProduct = typeof products.$inferInsert;

/** Who is looking: rows carry personal favourites and summaries of visible feedback. */
export interface Viewer {
  barId: string;
  userId: string;
}
export type ProductChanges = Partial<
  Pick<
    NewProduct,
    | "name"
    | "category_id"
    | "producer"
    | "country"
    | "region"
    | "abv"
    | "vintage"
    | "age_years"
    | "description"
    | "status"
  >
>;

export interface ProductFilter {
  q?: string;
  /** Any of these categories. */
  categoryIds?: string[];
  /** Any of these statuses; `none` matches bottles without one. */
  statuses?: (ProductStatus | typeof NO_STATUS)[];
  country?: CountryCode;
  /** Only the viewer's favourites. */
  favourite?: boolean;
  after?: NameCursor;
  limit: number;
}

/** `status IN (...)`, with `none` standing for NULL (which `IN` never matches). */
function statusFilter(statuses: (ProductStatus | typeof NO_STATUS)[] | undefined) {
  if (statuses === undefined) return undefined;
  const named = statuses.filter((status): status is ProductStatus => status !== NO_STATUS);
  return or(
    named.length > 0 ? inArray(products.status, named) : undefined,
    named.length < statuses.length ? isNull(products.status) : undefined,
  );
}

/** A per-bottle aggregate over its purchases: one index seek for each row returned. */
const ofPurchases = <T>(aggregate: SQL, filter?: SQL) =>
  sql<T>`(SELECT ${aggregate} FROM ${productPurchases} WHERE ${and(
    eq(productPurchases.bar_id, products.bar_id),
    eq(productPurchases.product_id, products.id),
    filter,
  )})`;

/**
 * Each bottle's tasting count, average score and last day, in one grouped query: over the bar for
 * lists, over the one bottle for a single lookup.
 */
const tastingStats = (db: Executor, { barId, userId }: Viewer, productId: string | undefined) =>
  db
    .select({
      product_id: tastings.product_id,
      count: sql<number>`count(*)`.as("tasting_count"),
      // avg ignores NULL: unscored tastings count but are not averaged.
      avg_score: sql<number | null>`round(avg(${tastings.score}), 1)`.as("tasting_avg_score"),
      last_tasted_on: sql<string | null>`max(${tastings.tasted_on})`.as("tasting_last_on"),
    })
    .from(tastings)
    .where(
      and(
        eq(tastings.bar_id, barId),
        visibleFeedback(tastings, userId),
        productId === undefined ? undefined : eq(tastings.product_id, productId),
      ),
    )
    .groupBy(tastings.product_id)
    .as("tasting_stats");

/**
 * Products joined with their category (same bar, enforced by the foreign key), their stock and
 * their tasting summary.
 */
const selectProducts = <E extends SelectedFields>(
  db: Executor,
  { barId, userId }: Viewer,
  extra: E,
  /** Set for a single lookup, so the tasting summary only groups that bottle's tastings. */
  productId?: string,
) => {
  const stats = tastingStats(db, { barId, userId }, productId);
  return db
    .select({
      ...columns,
      stock: {
        open_count: ofPurchases<number>(sql`count(*)`, isNull(productPurchases.finished_on)),
        total_count: ofPurchases<number>(sql`count(*)`),
        last_bought_on: ofPurchases<string | null>(sql`max(${productPurchases.bought_on})`),
        last_finished_on: ofPurchases<string | null>(sql`max(${productPurchases.finished_on})`),
      },
      // Wrapped in sql so a bottle without tastings keeps the object, with zero and nulls.
      tasting_summary: {
        count: sql<number>`coalesce(${stats.count}, 0)`,
        avg_score: sql<number | null>`${stats.avg_score}`,
        last_tasted_on: sql<string | null>`${stats.last_tasted_on}`,
      },
      is_favourite: isFavourite("product_id", userId),
      comment_count: sql<number>`(SELECT count(*) FROM ${bottleComments} WHERE ${and(
        eq(bottleComments.bar_id, products.bar_id),
        eq(bottleComments.product_id, products.id),
        visibleFeedback(bottleComments, userId),
      )})`,
      ...extra,
    })
    .from(products)
    .innerJoin(
      categories,
      and(eq(categories.bar_id, products.bar_id), eq(categories.id, products.category_id)),
    )
    .leftJoin(stats, eq(stats.product_id, products.id));
};

/** One page of the bar's products sorted by name; each row carries its name `key` for the cursor. */
export function listProducts(
  db: Executor,
  viewer: Viewer,
  { q, categoryIds, statuses, country, favourite, after, limit }: ProductFilter,
): (Product & { key: string })[] {
  const needle = sql`larder_name_key(${q})`;
  return selectProducts(db, viewer, { key: nameKey })
    .where(
      and(
        eq(products.bar_id, viewer.barId),
        q === undefined
          ? undefined
          : or(
              sql`instr(${nameKey}, ${needle}) > 0`,
              sql`instr(larder_name_key(ifnull(${products.producer}, '')), ${needle}) > 0`,
            ),
        categoryIds === undefined ? undefined : inArray(products.category_id, categoryIds),
        statusFilter(statuses),
        country === undefined ? undefined : eq(products.country, country),
        favourite === true ? isFavourite("product_id", viewer.userId) : undefined,
        afterName(nameKey, products.id, after),
      ),
    )
    .orderBy(...byName(nameKey, products.id))
    .limit(limit)
    .all();
}

export function findProduct(db: Executor, viewer: Viewer, id: string): Product | undefined {
  return selectProducts(db, viewer, {}, id)
    .where(and(eq(products.bar_id, viewer.barId), eq(products.id, id)))
    .get();
}

/** The bottle's id and name, when it is in the bar. */
export function findProductRef(db: Executor, barId: string, id: string) {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.bar_id, barId), eq(products.id, id)))
    .get();
}

/** The products filed directly under a category: what stops it from being deleted. */
export function listProductsInCategory(
  db: Executor,
  barId: string,
  categoryId: string,
): { id: string; name: string }[] {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.bar_id, barId), eq(products.category_id, categoryId)))
    .orderBy(...byName(nameKey, products.id))
    .all();
}

export function insertProduct(db: Executor, values: NewProduct): string {
  return db.insert(products).values(values).returning({ id: products.id }).get().id;
}

export function updateProduct(
  db: Executor,
  barId: string,
  id: string,
  changes: ProductChanges,
): void {
  db.update(products)
    .set(changes)
    .where(and(eq(products.bar_id, barId), eq(products.id, id)))
    .run();
}

export function deleteProduct(db: Executor, barId: string, id: string): void {
  db.delete(products)
    .where(and(eq(products.bar_id, barId), eq(products.id, id)))
    .run();
}

/** Every owned bottle (in the bar right now), by name: what generic category lines can pour from. */
export function listOwnedProducts(
  db: Executor,
  barId: string,
): { id: string; name: string; category_id: string }[] {
  return db
    .select({ id: products.id, name: products.name, category_id: products.category_id })
    .from(products)
    .where(and(eq(products.bar_id, barId), eq(products.status, "owned")))
    .orderBy(...byName(nameKey, products.id))
    .all();
}
