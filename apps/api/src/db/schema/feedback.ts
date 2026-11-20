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

/** A user's personal favourite cocktail; `created_by` is the same user. */
export const favourites = sqliteTable(
  "favourites",
  {
    ...personalColumns(),
    cocktail_id: text("cocktail_id").notNull(),
  },
  (t) => [
    index("favourites_created_by_idx").on(t.created_by),

    uniqueIndex("favourites_user_cocktail_unique").on(t.bar_id, t.created_by, t.cocktail_id),
    index("favourites_bar_id_cocktail_id_idx").on(t.bar_id, t.cocktail_id),
    foreignKey({
      name: "favourites_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
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
