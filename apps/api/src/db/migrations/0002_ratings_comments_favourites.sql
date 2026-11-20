CREATE TABLE `comments` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`cocktail_id` text NOT NULL,
	`body` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_body_check" CHECK(length("comments"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `comments_created_by_idx` ON `comments` (`created_by`);--> statement-breakpoint
CREATE INDEX `comments_bar_id_cocktail_id_created_at_idx` ON `comments` (`bar_id`,`cocktail_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `favourites` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`cocktail_id` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favourites_created_by_idx` ON `favourites` (`created_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `favourites_user_cocktail_unique` ON `favourites` (`bar_id`,`created_by`,`cocktail_id`);--> statement-breakpoint
CREATE INDEX `favourites_bar_id_cocktail_id_idx` ON `favourites` (`bar_id`,`cocktail_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`cocktail_id` text NOT NULL,
	`score` integer NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`cocktail_id`) REFERENCES `cocktails`(`bar_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ratings_score_check" CHECK("ratings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `ratings_created_by_idx` ON `ratings` (`created_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_cocktail_user_unique` ON `ratings` (`bar_id`,`cocktail_id`,`created_by`);