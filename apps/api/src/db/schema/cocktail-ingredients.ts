import { UNITS } from "@larder/shared";
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { categories, pantryIngredients, products } from "./catalogue.ts";
import { cocktails } from "./cocktails.ts";
import { id, timestamps } from "./columns.ts";
import { bars, users } from "./tenancy.ts";

const orderedSource = () => ({
  id: id(),
  bar_id: text("bar_id")
    .notNull()
    .references(() => bars.id, { onDelete: "cascade" }),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  ...timestamps(),
  position: integer("position").notNull(),
  category_id: text("category_id"),
  product_id: text("product_id"),
  pantry_ingredient_id: text("pantry_ingredient_id"),
  note: text("note"),
});

type SourceColumns = Record<
  "bar_id" | "category_id" | "product_id" | "pantry_ingredient_id",
  AnySQLiteColumn
>;

function sourceConstraints(table: string, t: SourceColumns) {
  return [
    foreignKey({
      name: `${table}_category_fk`,
      columns: [t.bar_id, t.category_id],
      foreignColumns: [categories.bar_id, categories.id],
    }),
    foreignKey({
      name: `${table}_product_fk`,
      columns: [t.bar_id, t.product_id],
      foreignColumns: [products.bar_id, products.id],
    }),
    foreignKey({
      name: `${table}_pantry_fk`,
      columns: [t.bar_id, t.pantry_ingredient_id],
      foreignColumns: [pantryIngredients.bar_id, pantryIngredients.id],
    }),
    check(
      `${table}_one_source_check`,
      sql`(${t.category_id} IS NOT NULL) + (${t.product_id} IS NOT NULL) + (${t.pantry_ingredient_id} IS NOT NULL) = 1`,
    ),
  ];
}

export const cocktailIngredients = sqliteTable(
  "cocktail_ingredients",
  {
    ...orderedSource(),
    cocktail_id: text("cocktail_id").notNull(),
    amount: real("amount"),
    unit: text("unit", { enum: UNITS }).notNull(),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("cocktail_ingredients_bar_id_id_unique").on(t.bar_id, t.id),
    uniqueIndex("cocktail_ingredients_position_unique").on(t.bar_id, t.cocktail_id, t.position),
    foreignKey({
      name: "cocktail_ingredients_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    ...sourceConstraints("cocktail_ingredients", t),
    check(
      "cocktail_ingredients_unit_check",
      sql`${t.unit} IN (${sql.raw(UNITS.map((unit) => `'${unit}'`).join(", "))})`,
    ),
    check(
      "cocktail_ingredients_amount_check",
      sql`(${t.amount} IS NULL AND ${t.unit} IN ('top', 'to_taste')) OR (${t.amount} IS NOT NULL AND ${t.amount} > 0)`,
    ),
  ],
);

export const cocktailIngredientAlternatives = sqliteTable(
  "cocktail_ingredient_alternatives",
  {
    ...orderedSource(),
    ingredient_id: text("ingredient_id").notNull(),
  },
  (t) => [
    uniqueIndex("cocktail_ingredient_alternatives_position_unique").on(
      t.bar_id,
      t.ingredient_id,
      t.position,
    ),
    foreignKey({
      name: "cocktail_ingredient_alternatives_ingredient_fk",
      columns: [t.bar_id, t.ingredient_id],
      foreignColumns: [cocktailIngredients.bar_id, cocktailIngredients.id],
    }).onDelete("cascade"),
    ...sourceConstraints("cocktail_ingredient_alternatives", t),
  ],
);
