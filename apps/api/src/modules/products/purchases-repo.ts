import type { Purchase } from "@larder/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { productPurchases } from "../../db/schema/index.ts";

const columns = {
  id: productPurchases.id,
  product_id: productPurchases.product_id,
  bought_on: productPurchases.bought_on,
  price_minor: productPurchases.price_minor,
  currency: productPurchases.currency,
  store: productPurchases.store,
  notes: productPurchases.notes,
  finished_on: productPurchases.finished_on,
  created_at: productPurchases.created_at,
  updated_at: productPurchases.updated_at,
};

export type NewPurchase = typeof productPurchases.$inferInsert;
export type PurchaseChanges = Partial<
  Pick<NewPurchase, "bought_on" | "price_minor" | "currency" | "store" | "notes" | "finished_on">
>;

const byId = (barId: string, id: string) =>
  and(eq(productPurchases.bar_id, barId), eq(productPurchases.id, id));

const ofProduct = (barId: string, productId: string) =>
  and(eq(productPurchases.bar_id, barId), eq(productPurchases.product_id, productId));

/** The bottle's purchases, newest first. */
export function listPurchases(db: Executor, barId: string, productId: string): Purchase[] {
  return db
    .select(columns)
    .from(productPurchases)
    .where(ofProduct(barId, productId))
    .orderBy(
      desc(productPurchases.bought_on),
      desc(productPurchases.created_at),
      desc(productPurchases.id),
    )
    .all();
}

export function findPurchase(
  db: Executor,
  barId: string,
  productId: string,
  id: string,
): Purchase | undefined {
  return db
    .select(columns)
    .from(productPurchases)
    .where(and(ofProduct(barId, productId), eq(productPurchases.id, id)))
    .get();
}

/** The open purchase bought first: the one that runs out next. */
export function findOldestOpenPurchase(
  db: Executor,
  barId: string,
  productId: string,
): Purchase | undefined {
  return db
    .select(columns)
    .from(productPurchases)
    .where(and(ofProduct(barId, productId), isNull(productPurchases.finished_on)))
    .orderBy(
      asc(productPurchases.bought_on),
      asc(productPurchases.created_at),
      asc(productPurchases.id),
    )
    .get();
}

/** The purchases that stop the bottle from being deleted, labelled by date. */
export function listPurchaseUsage(db: Executor, barId: string, productId: string) {
  return listPurchases(db, barId, productId).map(({ id, bought_on }) => ({
    id,
    name: `Bought on ${bought_on}`,
  }));
}

export function insertPurchases(db: Executor, values: NewPurchase[]): Purchase[] {
  return db.insert(productPurchases).values(values).returning(columns).all();
}

/** Returns the purchase as saved. The caller has checked it exists. */
export function updatePurchase(
  db: Executor,
  barId: string,
  id: string,
  changes: PurchaseChanges,
): Purchase {
  return db
    .update(productPurchases)
    .set(changes)
    .where(byId(barId, id))
    .returning(columns)
    .get() as Purchase;
}

export function deletePurchase(db: Executor, barId: string, id: string): void {
  db.delete(productPurchases).where(byId(barId, id)).run();
}
