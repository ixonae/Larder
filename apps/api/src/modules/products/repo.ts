import type { Product } from "@larder/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/sqlite-core";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { categories, products } from "../../db/schema/index.ts";

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
  in_bar: products.in_bar,
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
    | "in_bar"
  >
>;

export interface ProductFilter {
  q?: string;
  /** Any of these categories. */
  categoryIds?: string[];
  in_bar?: boolean;
  after?: NameCursor;
  limit: number;
}

/** Products joined with their category (same bar, enforced by the foreign key). */
const selectProducts = <E extends SelectedFields>(db: Executor, extra: E) =>
  db
    .select({ ...columns, ...extra })
    .from(products)
    .innerJoin(
      categories,
      and(eq(categories.bar_id, products.bar_id), eq(categories.id, products.category_id)),
    );

/** One page of the bar's products sorted by name; each row carries its name `key` for the cursor. */
export function listProducts(
  db: Executor,
  barId: string,
  { q, categoryIds, in_bar, after, limit }: ProductFilter,
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
        in_bar === undefined ? undefined : eq(products.in_bar, in_bar),
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
