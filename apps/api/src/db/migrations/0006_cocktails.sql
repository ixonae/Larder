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
CREATE INDEX `cocktails_bar_id_variant_of_id_idx` ON `cocktails` (`bar_id`,`variant_of_id`);