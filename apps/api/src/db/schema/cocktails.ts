import { COCKTAIL_ICE, COCKTAIL_METHODS } from "@larder/shared";
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
import { images, utensils } from "./catalogue.ts";
import { id, nocaseText, timestamps } from "./columns.ts";
import { bars, users } from "./tenancy.ts";

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const cocktails = sqliteTable(
  "cocktails",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
    name: nocaseText("name").notNull(),
    description: text("description"),
    method: text("method", { enum: COCKTAIL_METHODS }).notNull(),
    ice: text("ice", { enum: COCKTAIL_ICE }).notNull().default("none"),
    garnish: text("garnish"),
    glass_id: text("glass_id"),
    serving_notes: text("serving_notes"),
    servings: integer("servings").notNull().default(1),
    source: text("source"),
    notes: text("notes"),
    image_id: text("image_id").references(() => images.id),
    variant_of_id: text("variant_of_id"),
    variant_note: text("variant_note"),
  },
  (t) => [
    uniqueIndex("cocktails_bar_id_id_unique").on(t.bar_id, t.id),
    uniqueIndex("cocktails_name_unique").on(t.bar_id, sql`larder_name_key(${t.name})`),
    index("cocktails_bar_id_glass_id_idx").on(t.bar_id, t.glass_id),
    index("cocktails_bar_id_variant_of_id_idx").on(t.bar_id, t.variant_of_id),
    foreignKey({
      name: "cocktails_glass_fk",
      columns: [t.bar_id, t.glass_id],
      foreignColumns: [utensils.bar_id, utensils.id],
    }),
    foreignKey({
      name: "cocktails_variant_fk",
      columns: [t.bar_id, t.variant_of_id],
      foreignColumns: [t.bar_id, t.id],
    }),
    check("cocktails_method_check", sql`${t.method} IN (${sqlList(COCKTAIL_METHODS)})`),
    check("cocktails_ice_check", sql`${t.ice} IN (${sqlList(COCKTAIL_ICE)})`),
    check("cocktails_servings_check", sql`${t.servings} > 0`),
  ],
);
