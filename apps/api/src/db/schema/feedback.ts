import { COMMENT_MAX } from "@larder/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { products } from "./catalogue.ts";
import { auditColumns, cocktails } from "./cocktails.ts";
import { id } from "./columns.ts";
import { users } from "./tenancy.ts";

/**
 * Audit columns for personal data: unlike shared bar data, it belongs to its author and goes with
 * their account when it is deleted.
 */
const personalColumns = () => ({
  ...auditColumns(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

/**
 * A user's personal favourite: exactly one bottle or one cocktail. `created_by` is the user, and
 * only they see it. It goes with the user's account and with the bottle or cocktail.
 */
export const favourites = sqliteTable(
  "favourites",
  {
    id: id(),
    ...personalColumns(),
    product_id: text("product_id"),
    cocktail_id: text("cocktail_id"),
  },
  (t) => [
    index("favourites_created_by_idx").on(t.created_by),

    // Two partial indexes: SQLite treats every NULL as distinct.
    uniqueIndex("favourites_user_product_unique")
      .on(t.bar_id, t.created_by, t.product_id)
      .where(sql`${t.product_id} IS NOT NULL`),
    uniqueIndex("favourites_user_cocktail_unique")
      .on(t.bar_id, t.created_by, t.cocktail_id)
      .where(sql`${t.cocktail_id} IS NOT NULL`),
    // Child keys of the foreign keys below; they also serve every `bar_id` lookup.
    index("favourites_bar_id_product_id_idx").on(t.bar_id, t.product_id),
    index("favourites_bar_id_cocktail_id_idx").on(t.bar_id, t.cocktail_id),
    foreignKey({
      name: "favourites_product_fk",
      columns: [t.bar_id, t.product_id],
      foreignColumns: [products.bar_id, products.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "favourites_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    check("favourites_target_check", sql`(${t.product_id} IS NULL) <> (${t.cocktail_id} IS NULL)`),
  ],
);

/** One rating per user and cocktail; `created_by` is the rater. */
export const ratings = sqliteTable(
  "ratings",
  {
    ...personalColumns(),
    id: id(),
    cocktail_id: text("cocktail_id").notNull(),
    score: integer("score").notNull(),
  },
  (t) => [
    index("ratings_created_by_idx").on(t.created_by),

    uniqueIndex("ratings_cocktail_user_unique").on(t.bar_id, t.cocktail_id, t.created_by),
    foreignKey({
      name: "ratings_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    check("ratings_score_check", sql`${t.score} BETWEEN 1 AND 5`),
  ],
);

/** A comment on a cocktail; `created_by` is the author. Private comments are the author's alone. */
export const comments = sqliteTable(
  "comments",
  {
    ...personalColumns(),
    id: id(),
    cocktail_id: text("cocktail_id").notNull(),
    body: text("body").notNull(),
    is_private: integer("is_private", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("comments_created_by_idx").on(t.created_by),

    index("comments_bar_id_cocktail_id_created_at_idx").on(t.bar_id, t.cocktail_id, t.created_at),
    foreignKey({
      name: "comments_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    check(
      "comments_body_check",
      sql`length(${t.body}) BETWEEN 1 AND ${sql.raw(String(COMMENT_MAX))}`,
    ),
  ],
);
