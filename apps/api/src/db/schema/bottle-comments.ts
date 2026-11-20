import { COMMENT_MAX } from "@larder/shared";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { products } from "./catalogue.ts";
import { auditColumns } from "./cocktails.ts";
import { id } from "./columns.ts";

/**
 * A comment in a bottle's thread; `created_by` is the author, credited even after they leave
 * the bar. The thread goes with its bottle.
 */
export const bottleComments = sqliteTable(
  "bottle_comments",
  {
    id: id(),
    ...auditColumns(),
    product_id: text("product_id").notNull(),
    body: text("body").notNull(),
    is_private: integer("is_private", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("bottle_comments_created_by_idx").on(t.created_by),

    foreignKey({
      name: "bottle_comments_product_fk",
      columns: [t.bar_id, t.product_id],
      foreignColumns: [products.bar_id, products.id],
    }).onDelete("cascade"),
    // Child key of the product foreign key, also serving the thread (newest first) and its count.
    index("bottle_comments_bar_id_product_id_created_at_idx").on(
      t.bar_id,
      t.product_id,
      t.created_at,
    ),
    check(
      "bottle_comments_body_check",
      sql`length(${t.body}) BETWEEN 1 AND ${sql.raw(String(COMMENT_MAX))}`,
    ),
  ],
);
