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
ALTER TABLE `categories` ADD `image_id` text REFERENCES images(id);--> statement-breakpoint
ALTER TABLE `products` ADD `image_id` text REFERENCES images(id);--> statement-breakpoint
ALTER TABLE `utensils` ADD `image_id` text REFERENCES images(id);