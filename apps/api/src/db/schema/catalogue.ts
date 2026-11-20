import { CATEGORY_KINDS, COUNTRY_CODES, PRODUCT_STATUSES, UTENSIL_KINDS } from "@larder/shared";
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
import { createdAt, id, nocaseText, sqlList, timestamps } from "./columns.ts";
import { bars, users } from "./tenancy.ts";

/** An uploaded picture, re-encoded to WebP, with its thumbnail. Items hold `image_id`; bundled pictures can have multiple owners. */
export const images = sqliteTable(
  "images",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    storage_key: text("storage_key").notNull(),
    thumb_key: text("thumb_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: createdAt(),
  },
  (t) => [index("images_created_by_idx").on(t.created_by), index("images_bar_id_idx").on(t.bar_id)],
);

/** The item's picture. Images are only ever created by the server for the item's own bar. */
const imageId = () => text("image_id").references(() => images.id);

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
    image_id: imageId(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("categories_created_by_idx").on(t.created_by),
    index("categories_image_id_idx").on(t.image_id),

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
  ],
);

/**
 * A supply the bar keeps that is not a bottle (Lemon, Egg, Salt…), grouped under a category.
 * Either flag makes it available.
 */
export const pantryIngredients = sqliteTable(
  "pantry_ingredients",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    category_id: text("category_id").notNull(),
    name: nocaseText("name").notNull(),
    in_stock: integer("in_stock", { mode: "boolean" }).notNull().default(false),
    always_available: integer("always_available", { mode: "boolean" }).notNull().default(false),
    image_id: imageId(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("pantry_ingredients_created_by_idx").on(t.created_by),
    index("pantry_ingredients_image_id_idx").on(t.image_id),

    // Target for cocktail lines (S17); also serves every `bar_id` lookup.
    uniqueIndex("pantry_ingredients_bar_id_id_unique").on(t.bar_id, t.id),
    // The category must be in the same bar.
    foreignKey({
      name: "pantry_ingredients_category_fk",
      columns: [t.bar_id, t.category_id],
      foreignColumns: [categories.bar_id, categories.id],
    }),
    // Unique within its category. The name key comes before the category so the index also serves
    // the list, sorted by name.
    uniqueIndex("pantry_ingredients_name_unique").on(
      t.bar_id,
      sql`larder_name_key(${t.name})`,
      t.category_id,
    ),
    // Child key of the category foreign key: lookups by category (delete checks, FK enforcement).
    index("pantry_ingredients_bar_id_category_id_idx").on(t.bar_id, t.category_id),
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
    country: text("country", { enum: COUNTRY_CODES }),
    region: text("region"),
    abv: real("abv"),
    vintage: integer("vintage"),
    age_years: integer("age_years"),
    description: text("description"),
    image_id: imageId(),
    /** `owned` is the only status that counts as in the bar; null means none. */
    status: text("status", { enum: PRODUCT_STATUSES }),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("products_created_by_idx").on(t.created_by),
    index("products_image_id_idx").on(t.image_id),

    // Target for cocktail lines (S17); also serves every `bar_id` lookup.
    uniqueIndex("products_bar_id_id_unique").on(t.bar_id, t.id),
    // The category must be in the same bar.
    foreignKey({
      name: "products_category_fk",
      columns: [t.bar_id, t.category_id],
      foreignColumns: [categories.bar_id, categories.id],
    }),
    index("products_bar_id_category_id_idx").on(t.bar_id, t.category_id),
    index("products_bar_id_status_idx").on(t.bar_id, t.status),
    // The same name is allowed once per vintage, and once without one: two indexes, because
    // SQLite treats every NULL vintage as distinct.
    uniqueIndex("products_vintage_name_unique")
      .on(t.bar_id, sql`larder_name_key(${t.name})`, t.vintage)
      .where(sql`${t.vintage} IS NOT NULL`),
    uniqueIndex("products_name_unique")
      .on(t.bar_id, sql`larder_name_key(${t.name})`)
      .where(sql`${t.vintage} IS NULL`),
    check(
      "products_country_check",
      sql`${t.country} IS NULL OR ${t.country} IN (${sqlList(COUNTRY_CODES)})`,
    ),
    check(
      "products_status_check",
      sql`${t.status} IS NULL OR ${t.status} IN (${sqlList(PRODUCT_STATUSES)})`,
    ),
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
    image_id: imageId(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("utensils_created_by_idx").on(t.created_by),
    index("utensils_image_id_idx").on(t.image_id),

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
