CREATE TABLE `bottle_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`product_id` text NOT NULL,
	`body` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bottle_comments_body_check" CHECK(length("bottle_comments"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `bottle_comments_created_by_idx` ON `bottle_comments` (`created_by`);--> statement-breakpoint
CREATE INDEX `bottle_comments_bar_id_product_id_created_at_idx` ON `bottle_comments` (`bar_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tastings` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`product_id` text NOT NULL,
	`tasted_on` text NOT NULL,
	`score` integer,
	`notes` text,
	`location` text,
	`is_private` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tastings_score_check" CHECK("tastings"."score" IS NULL OR "tastings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `tastings_created_by_idx` ON `tastings` (`created_by`);--> statement-breakpoint
CREATE INDEX `tastings_bar_id_product_id_tasted_on_idx` ON `tastings` (`bar_id`,`product_id`,`tasted_on`);--> statement-breakpoint
CREATE INDEX `tastings_bar_id_tasted_on_idx` ON `tastings` (`bar_id`,`tasted_on`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_favourites` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`product_id` text,
	`cocktail_id` text,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "favourites_target_check" CHECK(("__new_favourites"."product_id" IS NULL) <> ("__new_favourites"."cocktail_id" IS NULL))
);
--> statement-breakpoint
-- Assign UUIDv7 IDs to existing cocktail favourites using their original creation time.
INSERT INTO `__new_favourites`("id", "bar_id", "created_by", "created_at", "updated_at", "product_id", "cocktail_id") SELECT substr(printf('%012x', CAST(unixepoch("created_at", 'subsec') * 1000 AS INTEGER)), 1, 8) || '-' || substr(printf('%012x', CAST(unixepoch("created_at", 'subsec') * 1000 AS INTEGER)), 9, 4) || '-7' || substr(lower(hex(randomblob(2))), 2, 3) || '-' || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2, 3) || '-' || lower(hex(randomblob(6))), "bar_id", "created_by", "created_at", "updated_at", NULL, "cocktail_id" FROM `favourites`;--> statement-breakpoint
DROP TABLE `favourites`;--> statement-breakpoint
ALTER TABLE `__new_favourites` RENAME TO `favourites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `favourites_created_by_idx` ON `favourites` (`created_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `favourites_user_product_unique` ON `favourites` (`bar_id`,`created_by`,`product_id`) WHERE "favourites"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `favourites_user_cocktail_unique` ON `favourites` (`bar_id`,`created_by`,`cocktail_id`) WHERE "favourites"."cocktail_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `favourites_bar_id_product_id_idx` ON `favourites` (`bar_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `favourites_bar_id_cocktail_id_idx` ON `favourites` (`bar_id`,`cocktail_id`);
