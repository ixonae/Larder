ALTER TABLE `pantry_ingredients` ADD `image_id` text REFERENCES images(id);--> statement-breakpoint
CREATE INDEX `pantry_ingredients_image_id_idx` ON `pantry_ingredients` (`image_id`);