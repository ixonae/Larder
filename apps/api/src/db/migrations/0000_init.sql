CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`parent_id` text,
	`name` text COLLATE NOCASE NOT NULL,
	`kind` text NOT NULL,
	`default_abv` real,
	`description` text,
	`image_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`parent_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_kind_check" CHECK("categories"."kind" IN ('spirit', 'liqueur', 'wine', 'beer', 'mixer', 'juice', 'syrup', 'bitters', 'garnish', 'other')),
	CONSTRAINT "categories_default_abv_check" CHECK("categories"."default_abv" IS NULL OR "categories"."default_abv" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_bar_id_id_unique` ON `categories` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_child_name_unique` ON `categories` (`bar_id`,`parent_id`,larder_name_key("name")) WHERE "categories"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_root_name_unique` ON `categories` (`bar_id`,larder_name_key("name")) WHERE "categories"."parent_id" IS NULL;--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `images_bar_id_idx` ON `images` (`bar_id`);--> statement-breakpoint
CREATE TABLE `pantry_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`in_stock` integer DEFAULT false NOT NULL,
	`always_available` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_ingredients_bar_id_id_unique` ON `pantry_ingredients` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_ingredients_name_unique` ON `pantry_ingredients` (`bar_id`,larder_name_key("name"),`category_id`);--> statement-breakpoint
CREATE INDEX `pantry_ingredients_bar_id_category_id_idx` ON `pantry_ingredients` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`producer` text,
	`country` text,
	`region` text,
	`abv` real,
	`vintage` integer,
	`age_years` integer,
	`description` text,
	`image_id` text,
	`in_bar` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_abv_check" CHECK("products"."abv" IS NULL OR "products"."abv" BETWEEN 0 AND 100),
	CONSTRAINT "products_age_years_check" CHECK("products"."age_years" IS NULL OR "products"."age_years" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_bar_id_id_unique` ON `products` (`bar_id`,`id`);--> statement-breakpoint
CREATE INDEX `products_bar_id_category_id_idx` ON `products` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_vintage_name_unique` ON `products` (`bar_id`,larder_name_key("name"),`vintage`) WHERE "products"."vintage" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`bar_id`,larder_name_key("name")) WHERE "products"."vintage" IS NULL;--> statement-breakpoint
CREATE TABLE `utensils` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`kind` text NOT NULL,
	`capacity_ml` real,
	`description` text,
	`image_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "utensils_kind_check" CHECK("utensils"."kind" IN ('glass', 'tool')),
	CONSTRAINT "utensils_capacity_check" CHECK("utensils"."capacity_ml" IS NULL OR ("utensils"."kind" = 'glass' AND "utensils"."capacity_ml" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utensils_bar_id_id_unique` ON `utensils` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `utensils_name_unique` ON `utensils` (`bar_id`,larder_name_key("name"));--> statement-breakpoint
CREATE TABLE `cocktail_ingredient_alternatives` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`position` integer NOT NULL,
	`category_id` text,
	`product_id` text,
	`pantry_ingredient_id` text,
	`note` text,
	`ingredient_id` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`ingredient_id`) REFERENCES `cocktail_ingredients`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`pantry_ingredient_id`) REFERENCES `pantry_ingredients`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cocktail_ingredient_alternatives_one_source_check" CHECK(("cocktail_ingredient_alternatives"."category_id" IS NOT NULL) + ("cocktail_ingredient_alternatives"."product_id" IS NOT NULL) + ("cocktail_ingredient_alternatives"."pantry_ingredient_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cocktail_ingredient_alternatives_position_unique` ON `cocktail_ingredient_alternatives` (`bar_id`,`ingredient_id`,`position`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_category_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_product_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_pantry_ingredient_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`pantry_ingredient_id`);--> statement-breakpoint
CREATE TABLE `cocktail_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`position` integer NOT NULL,
	`category_id` text,
	`product_id` text,
	`pantry_ingredient_id` text,
	`note` text,
	`cocktail_id` text NOT NULL,
	`amount` real,
	`unit` text NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`preparation_only` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`pantry_ingredient_id`) REFERENCES `pantry_ingredients`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cocktail_ingredients_one_source_check" CHECK(("cocktail_ingredients"."category_id" IS NOT NULL) + ("cocktail_ingredients"."product_id" IS NOT NULL) + ("cocktail_ingredients"."pantry_ingredient_id" IS NOT NULL) = 1),
	CONSTRAINT "cocktail_ingredients_unit_check" CHECK("cocktail_ingredients"."unit" IN ('ml', 'cl', 'oz', 'tsp', 'barspoon', 'tbsp', 'dash', 'drop', 'splash', 'piece', 'slice', 'wedge', 'sprig', 'leaf', 'top', 'to_taste')),
	CONSTRAINT "cocktail_ingredients_amount_check" CHECK(("cocktail_ingredients"."amount" IS NULL AND "cocktail_ingredients"."unit" IN ('top', 'to_taste')) OR ("cocktail_ingredients"."amount" IS NOT NULL AND "cocktail_ingredients"."amount" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cocktail_ingredients_bar_id_id_unique` ON `cocktail_ingredients` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cocktail_ingredients_position_unique` ON `cocktail_ingredients` (`bar_id`,`cocktail_id`,`position`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_category_id_idx` ON `cocktail_ingredients` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_product_id_idx` ON `cocktail_ingredients` (`bar_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_pantry_ingredient_id_idx` ON `cocktail_ingredients` (`bar_id`,`pantry_ingredient_id`);--> statement-breakpoint
CREATE TABLE `cocktail_steps` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`cocktail_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cocktail_steps_position_unique` ON `cocktail_steps` (`bar_id`,`cocktail_id`,`position`);--> statement-breakpoint
CREATE TABLE `cocktail_tags` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`cocktail_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`cocktail_id`, `tag_id`),
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`tag_id`) REFERENCES `tags`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cocktail_tags_bar_id_cocktail_id_idx` ON `cocktail_tags` (`bar_id`,`cocktail_id`);--> statement-breakpoint
CREATE INDEX `cocktail_tags_bar_id_tag_id_idx` ON `cocktail_tags` (`bar_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `cocktail_utensils` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`cocktail_id` text NOT NULL,
	`utensil_id` text NOT NULL,
	PRIMARY KEY(`cocktail_id`, `utensil_id`),
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`utensil_id`) REFERENCES `utensils`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cocktail_utensils_bar_id_cocktail_id_idx` ON `cocktail_utensils` (`bar_id`,`cocktail_id`);--> statement-breakpoint
CREATE INDEX `cocktail_utensils_bar_id_utensil_id_idx` ON `cocktail_utensils` (`bar_id`,`utensil_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_bar_id_id_unique` ON `tags` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`bar_id`,larder_name_key("name"));--> statement-breakpoint
CREATE TABLE `cocktails` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`description` text,
	`method` text NOT NULL,
	`ice` text DEFAULT 'none' NOT NULL,
	`garnish` text,
	`glass_id` text,
	`serving_notes` text,
	`servings` integer DEFAULT 1 NOT NULL,
	`source` text,
	`notes` text,
	`image_id` text,
	`variant_of_id` text,
	`variant_note` text,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`glass_id`) REFERENCES `utensils`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`variant_of_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cocktails_method_check" CHECK("cocktails"."method" IN ('shaken', 'stirred', 'built', 'blended', 'thrown', 'other')),
	CONSTRAINT "cocktails_ice_check" CHECK("cocktails"."ice" IN ('none', 'cubes', 'crushed', 'large_cube', 'other')),
	CONSTRAINT "cocktails_servings_check" CHECK("cocktails"."servings" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cocktails_bar_id_id_unique` ON `cocktails` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cocktails_name_unique` ON `cocktails` (`bar_id`,larder_name_key("name"));--> statement-breakpoint
CREATE INDEX `cocktails_bar_id_glass_id_idx` ON `cocktails` (`bar_id`,`glass_id`);--> statement-breakpoint
CREATE INDEX `cocktails_bar_id_variant_of_id_idx` ON `cocktails` (`bar_id`,`variant_of_id`);--> statement-breakpoint
CREATE TABLE `bar_data_migrations` (
	`bar_id` text NOT NULL,
	`migration` text NOT NULL,
	PRIMARY KEY(`bar_id`, `migration`),
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bar_members` (
	`bar_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`bar_id`, `user_id`),
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bar_members_role_check" CHECK("bar_members"."role" IN ('viewer', 'editor', 'owner'))
);
--> statement-breakpoint
CREATE INDEX `bar_members_user_id_idx` ON `bar_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `bars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bars_owner_id_idx` ON `bars` (`owner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`display_name` text COLLATE NOCASE NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);