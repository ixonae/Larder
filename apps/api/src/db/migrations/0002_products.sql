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
	`in_bar` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_abv_check" CHECK("products"."abv" IS NULL OR "products"."abv" BETWEEN 0 AND 100),
	CONSTRAINT "products_age_years_check" CHECK("products"."age_years" IS NULL OR "products"."age_years" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_bar_id_id_unique` ON `products` (`bar_id`,`id`);--> statement-breakpoint
CREATE INDEX `products_bar_id_category_id_idx` ON `products` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_vintage_name_unique` ON `products` (`bar_id`,larder_name_key("name"),`vintage`) WHERE "products"."vintage" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`bar_id`,larder_name_key("name")) WHERE "products"."vintage" IS NULL;