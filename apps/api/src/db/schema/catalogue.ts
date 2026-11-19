import { CATEGORY_KINDS, IN_STOCK_KINDS, UTENSIL_KINDS } from "@larder/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
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

export const products = sqliteTable(
  "products",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    category_id: text("category_id").notNull(),
    name: nocaseText("name").notNull(),
    producer: text("producer"),
    country: text("country"),
    region: text("region"),
    abv: real("abv"),
    vintage: integer("vintage"),
    age_years: integer("age_years"),
    description: text("description"),
    in_bar: integer("in_bar", { mode: "boolean" }).notNull().default(false),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // Target for cocktail lines (S17); also serves every `bar_id` lookup.
    uniqueIndex("products_bar_id_id_unique").on(t.bar_id, t.id),
    // The category must be in the same bar.
    foreignKey({
      name: "products_category_fk",
      columns: [t.bar_id, t.category_id],
      foreignColumns: [categories.bar_id, categories.id],
    }),
    index("products_bar_id_category_id_idx").on(t.bar_id, t.category_id),
    // The same name is allowed once per vintage, and once without one: two indexes, because
    // SQLite treats every NULL vintage as distinct.
    uniqueIndex("products_vintage_name_unique")
      .on(t.bar_id, sql`larder_name_key(${t.name})`, t.vintage)
      .where(sql`${t.vintage} IS NOT NULL`),
    uniqueIndex("products_name_unique")
      .on(t.bar_id, sql`larder_name_key(${t.name})`)
      .where(sql`${t.vintage} IS NULL`),
    check("products_abv_check", sql`${t.abv} IS NULL OR ${t.abv} BETWEEN 0 AND 100`),
    check("products_age_years_check", sql`${t.age_years} IS NULL OR ${t.age_years} >= 0`),
  ],
);

export const utensils = sqliteTable(
  "utensils",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    name: nocaseText("name").notNull(),
    kind: text("kind", { enum: UTENSIL_KINDS }).notNull(),
    capacity_ml: real("capacity_ml"),
    description: text("description"),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // Target for cocktail glasses and tools (S16, S17); also serves every `bar_id` lookup.
    uniqueIndex("utensils_bar_id_id_unique").on(t.bar_id, t.id),
    uniqueIndex("utensils_name_unique").on(t.bar_id, sql`larder_name_key(${t.name})`),
    check("utensils_kind_check", sql`${t.kind} IN (${sqlList(UTENSIL_KINDS)})`),
    check(
      "utensils_capacity_check",
      sql`${t.capacity_ml} IS NULL OR (${t.kind} = 'glass' AND ${t.capacity_ml} > 0)`,
    ),
  ],
);
