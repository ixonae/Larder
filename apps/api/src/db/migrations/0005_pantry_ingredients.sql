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
CREATE INDEX `pantry_ingredients_bar_id_category_id_idx` ON `pantry_ingredients` (`bar_id`,`category_id`);