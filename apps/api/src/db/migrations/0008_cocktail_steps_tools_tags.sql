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
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_category_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_product_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_bar_id_pantry_ingredient_id_idx` ON `cocktail_ingredient_alternatives` (`bar_id`,`pantry_ingredient_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_category_id_idx` ON `cocktail_ingredients` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_product_id_idx` ON `cocktail_ingredients` (`bar_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_bar_id_pantry_ingredient_id_idx` ON `cocktail_ingredients` (`bar_id`,`pantry_ingredient_id`);