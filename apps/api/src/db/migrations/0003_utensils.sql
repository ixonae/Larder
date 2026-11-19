CREATE TABLE `utensils` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`kind` text NOT NULL,
	`capacity_ml` real,
	`description` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "utensils_kind_check" CHECK("utensils"."kind" IN ('glass', 'tool')),
	CONSTRAINT "utensils_capacity_check" CHECK("utensils"."capacity_ml" IS NULL OR ("utensils"."kind" = 'glass' AND "utensils"."capacity_ml" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utensils_bar_id_id_unique` ON `utensils` (`bar_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `utensils_name_unique` ON `utensils` (`bar_id`,larder_name_key("name"));