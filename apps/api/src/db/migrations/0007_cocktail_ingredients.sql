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
CREATE UNIQUE INDEX `cocktail_ingredients_position_unique` ON `cocktail_ingredients` (`bar_id`,`cocktail_id`,`position`);