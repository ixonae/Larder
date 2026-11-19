import { CATEGORY_KINDS, IN_STOCK_KINDS } from "@larder/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { id, nocaseText, timestamps } from "./columns.ts";
import { bars, users } from "./tenancy.ts";

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    parent_id: text("parent_id"),
    name: nocaseText("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
    default_abv: real("default_abv"),
    description: text("description"),
    always_available: integer("always_available", { mode: "boolean" }).notNull().default(false),
    in_stock: integer("in_stock", { mode: "boolean" }),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // Target of the parent foreign key below; also serves every `bar_id` lookup.
    uniqueIndex("categories_bar_id_id_unique").on(t.bar_id, t.id),
    // The parent must be in the same bar.
    foreignKey({
      name: "categories_parent_fk",
      columns: [t.bar_id, t.parent_id],
      foreignColumns: [t.bar_id, t.id],
    }),
    // Two indexes, because SQLite treats every NULL parent as distinct.
    uniqueIndex("categories_child_name_unique")
      .on(t.bar_id, t.parent_id, sql`larder_name_key(${t.name})`)
      .where(sql`${t.parent_id} IS NOT NULL`),
    uniqueIndex("categories_root_name_unique")
      .on(t.bar_id, sql`larder_name_key(${t.name})`)
      .where(sql`${t.parent_id} IS NULL`),
    check("categories_kind_check", sql`${t.kind} IN (${sqlList(CATEGORY_KINDS)})`),
    check(
      "categories_default_abv_check",
      sql`${t.default_abv} IS NULL OR ${t.default_abv} BETWEEN 0 AND 100`,
    ),
    check(
      "categories_in_stock_check",
      sql`${t.in_stock} IS NULL OR ${t.kind} IN (${sqlList(IN_STOCK_KINDS)})`,
    ),
  ],
);
