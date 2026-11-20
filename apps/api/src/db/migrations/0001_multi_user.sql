CREATE TABLE `installation_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`signup_mode` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `bar_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bar_invitations_role_check" CHECK("bar_invitations"."role" IN ('viewer', 'editor'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_invitations_token_hash_unique` ON `bar_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `bar_invitations_bar_id_expires_at_idx` ON `bar_invitations` (`bar_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `bar_invitations_created_by_idx` ON `bar_invitations` (`created_by`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `disabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` text;--> statement-breakpoint
CREATE INDEX `categories_created_by_idx` ON `categories` (`created_by`);--> statement-breakpoint
CREATE INDEX `categories_image_id_idx` ON `categories` (`image_id`);--> statement-breakpoint
CREATE INDEX `images_created_by_idx` ON `images` (`created_by`);--> statement-breakpoint
CREATE INDEX `pantry_ingredients_created_by_idx` ON `pantry_ingredients` (`created_by`);--> statement-breakpoint
CREATE INDEX `products_created_by_idx` ON `products` (`created_by`);--> statement-breakpoint
CREATE INDEX `products_image_id_idx` ON `products` (`image_id`);--> statement-breakpoint
CREATE INDEX `utensils_created_by_idx` ON `utensils` (`created_by`);--> statement-breakpoint
CREATE INDEX `utensils_image_id_idx` ON `utensils` (`image_id`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredient_alternatives_created_by_idx` ON `cocktail_ingredient_alternatives` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktail_ingredients_created_by_idx` ON `cocktail_ingredients` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktail_steps_created_by_idx` ON `cocktail_steps` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktail_tags_created_by_idx` ON `cocktail_tags` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktail_utensils_created_by_idx` ON `cocktail_utensils` (`created_by`);--> statement-breakpoint
CREATE INDEX `tags_created_by_idx` ON `tags` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktails_created_by_idx` ON `cocktails` (`created_by`);--> statement-breakpoint
CREATE INDEX `cocktails_image_id_idx` ON `cocktails` (`image_id`);