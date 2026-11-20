import { CURRENCY_CODES } from "@larder/shared";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { products } from "./catalogue.ts";
import { auditColumns } from "./cocktails.ts";
import { id, sqlList } from "./columns.ts";

/** One physical bottle bought; `finished_on` is set when it ran out. */
export const productPurchases = sqliteTable(
  "product_purchases",
  {
    id: id(),
    ...auditColumns(),
    product_id: text("product_id").notNull(),
    /** `YYYY-MM-DD`. */
    bought_on: text("bought_on").notNull(),
    /** Price of this bottle in minor units of `currency`. */
    price_minor: integer("price_minor"),
    currency: text("currency", { enum: CURRENCY_CODES }),
    store: text("store"),
    notes: text("notes"),
    /** `YYYY-MM-DD`; null while the bottle is open. */
    finished_on: text("finished_on"),
  },
  (t) => [
    index("product_purchases_created_by_idx").on(t.created_by),

    // The bottle must be in the same bar. No cascade: a bottle with purchases cannot be deleted.
    foreignKey({
      name: "product_purchases_product_fk",
      columns: [t.bar_id, t.product_id],
      foreignColumns: [products.bar_id, products.id],
    }),
    // Child key of the product foreign key, also serving `bar_id` lookups and the history order.
    index("product_purchases_bar_id_product_id_bought_on_idx").on(
      t.bar_id,
      t.product_id,
      t.bought_on,
    ),
    check("product_purchases_price_check", sql`${t.price_minor} IS NULL OR ${t.price_minor} >= 0`),
    check(
      "product_purchases_currency_check",
      // IN alone would let a NULL currency through: a CHECK only fails on false.
      sql`CASE WHEN ${t.price_minor} IS NULL THEN ${t.currency} IS NULL ELSE ${t.currency} IS NOT NULL AND ${t.currency} IN (${sqlList(CURRENCY_CODES)}) END`,
    ),
    check(
      "product_purchases_finished_on_check",
      sql`${t.finished_on} IS NULL OR ${t.finished_on} >= ${t.bought_on}`,
    ),
  ],
);
