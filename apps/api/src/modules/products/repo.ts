import { type CountryCode, NO_STATUS, type Product, type ProductStatus } from "@larder/shared";
import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { categories, productPurchases, products } from "../../db/schema/index.ts";

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

/** Products joined with their category (same bar, enforced by the foreign key) and their stock. */
const selectProducts = <E extends SelectedFields>(db: Executor, extra: E) =>
  db
    .select({
      ...columns,
      stock: {
        open_count: ofPurchases<number>(sql`count(*)`, isNull(productPurchases.finished_on)),
        total_count: ofPurchases<number>(sql`count(*)`),
        last_bought_on: ofPurchases<string | null>(sql`max(${productPurchases.bought_on})`),
        last_finished_on: ofPurchases<string | null>(sql`max(${productPurchases.finished_on})`),
      },
      ...extra,
    })
    .from(products)
    .innerJoin(
      categories,
      and(eq(categories.bar_id, products.bar_id), eq(categories.id, products.category_id)),
    );

/** One page of the bar's products sorted by name; each row carries its name `key` for the cursor. */
export function listProducts(
  db: Executor,
  barId: string,
  { q, categoryIds, statuses, country, after, limit }: ProductFilter,
): (Product & { key: string })[] {
  const needle = sql`larder_name_key(${q})`;
  return selectProducts(db, { key: nameKey })
    .where(
      and(
        eq(products.bar_id, barId),
        q === undefined
          ? undefined
          : or(
              sql`instr(${nameKey}, ${needle}) > 0`,
              sql`instr(larder_name_key(ifnull(${products.producer}, '')), ${needle}) > 0`,
            ),
        categoryIds === undefined ? undefined : inArray(products.category_id, categoryIds),
        statusFilter(statuses),
        country === undefined ? undefined : eq(products.country, country),
        afterName(nameKey, products.id, after),
      ),
    )
    .orderBy(...byName(nameKey, products.id))
    .limit(limit)
    .all();
}

export function findProduct(db: Executor, barId: string, id: string): Product | undefined {
  return selectProducts(db, {})
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
