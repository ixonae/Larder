CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`parent_id` text,
	`name` text COLLATE NOCASE NOT NULL,
	`kind` text NOT NULL,
	`default_abv` real,
	`description` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`parent_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_kind_check" CHECK("categories"."kind" IN ('spirit', 'liqueur', 'wine', 'beer', 'mixer', 'juice', 'syrup', 'bitters', 'garnish', 'other')),
	CONSTRAINT "categories_default_abv_check" CHECK("categories"."default_abv" IS NULL OR "categories"."default_abv" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_bar_id_id_unique` ON `categories` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_child_name_unique` ON `categories` (`bar_id`,`parent_id`,larder_name_key("name")) WHERE "categories"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_root_name_unique` ON `categories` (`bar_id`,larder_name_key("name")) WHERE "categories"."parent_id" IS NULL;