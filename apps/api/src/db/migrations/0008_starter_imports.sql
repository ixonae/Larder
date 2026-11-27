CREATE TABLE `starter_imports` (
	`bar_id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `starter_imports_owner_id_idx` ON `starter_imports` (`owner_id`);