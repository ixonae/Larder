import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { utensils } from "./catalogue.ts";
import { auditColumns, cocktails } from "./cocktails.ts";
import { id, nocaseText } from "./columns.ts";

export const cocktailSteps = sqliteTable(
  "cocktail_steps",
  {
    ...auditColumns(),
    id: id(),
    cocktail_id: text("cocktail_id").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    uniqueIndex("cocktail_steps_position_unique").on(t.bar_id, t.cocktail_id, t.position),
    foreignKey({
      name: "cocktail_steps_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
  ],
);

export const cocktailUtensils = sqliteTable(
  "cocktail_utensils",
  {
    ...auditColumns(),
    cocktail_id: text("cocktail_id").notNull(),
    utensil_id: text("utensil_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cocktail_id, t.utensil_id] }),
    index("cocktail_utensils_bar_id_cocktail_id_idx").on(t.bar_id, t.cocktail_id),
    index("cocktail_utensils_bar_id_utensil_id_idx").on(t.bar_id, t.utensil_id),
    foreignKey({
      name: "cocktail_utensils_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cocktail_utensils_utensil_fk",
      columns: [t.bar_id, t.utensil_id],
      foreignColumns: [utensils.bar_id, utensils.id],
    }),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    ...auditColumns(),
    id: id(),
    name: nocaseText("name").notNull(),
  },
  (t) => [
    uniqueIndex("tags_bar_id_id_unique").on(t.bar_id, t.id),
    uniqueIndex("tags_name_unique").on(t.bar_id, sql`larder_name_key(${t.name})`),
  ],
);

export const cocktailTags = sqliteTable(
  "cocktail_tags",
  {
    ...auditColumns(),
    cocktail_id: text("cocktail_id").notNull(),
    tag_id: text("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cocktail_id, t.tag_id] }),
    index("cocktail_tags_bar_id_cocktail_id_idx").on(t.bar_id, t.cocktail_id),
    index("cocktail_tags_bar_id_tag_id_idx").on(t.bar_id, t.tag_id),
    foreignKey({
      name: "cocktail_tags_cocktail_fk",
      columns: [t.bar_id, t.cocktail_id],
      foreignColumns: [cocktails.bar_id, cocktails.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cocktail_tags_tag_fk",
      columns: [t.bar_id, t.tag_id],
      foreignColumns: [tags.bar_id, tags.id],
    }),
  ],
);
