import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { products } from "./catalogue.ts";
import { auditColumns } from "./cocktails.ts";
import { id } from "./columns.ts";

/** A tasting journal entry; `created_by` is the taster, credited even after they leave the bar. */
export const tastings = sqliteTable(
  "tastings",
  {
    id: id(),
    ...auditColumns(),
    product_id: text("product_id").notNull(),
    /** `YYYY-MM-DD`. */
    tasted_on: text("tasted_on").notNull(),
    /** 1–5; null when no score was given. */
    score: integer("score"),
    notes: text("notes"),
    location: text("location"),
    is_private: integer("is_private", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("tastings_created_by_idx").on(t.created_by),

    // The bottle must be in the same bar. No cascade: a bottle with tastings cannot be deleted.
    foreignKey({
      name: "tastings_product_fk",
      columns: [t.bar_id, t.product_id],
      foreignColumns: [products.bar_id, products.id],
    }),
    // Child key of the product foreign key, also serving a bottle's journal and its summary.
    index("tastings_bar_id_product_id_tasted_on_idx").on(t.bar_id, t.product_id, t.tasted_on),
    // The bar's journal, newest first.
    index("tastings_bar_id_tasted_on_idx").on(t.bar_id, t.tasted_on),
    check("tastings_score_check", sql`${t.score} IS NULL OR ${t.score} BETWEEN 1 AND 5`),
  ],
);
