CREATE TABLE `product_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`product_id` text NOT NULL,
	`bought_on` text NOT NULL,
	`price_minor` integer,
	`currency` text,
	`store` text,
	`notes` text,
	`finished_on` text,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`product_id`) REFERENCES `products`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_purchases_price_check" CHECK("product_purchases"."price_minor" IS NULL OR "product_purchases"."price_minor" >= 0),
	CONSTRAINT "product_purchases_currency_check" CHECK(CASE WHEN "product_purchases"."price_minor" IS NULL THEN "product_purchases"."currency" IS NULL ELSE "product_purchases"."currency" IS NOT NULL AND "product_purchases"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'YER', 'ZAR', 'ZMW', 'ZWG') END),
	CONSTRAINT "product_purchases_finished_on_check" CHECK("product_purchases"."finished_on" IS NULL OR "product_purchases"."finished_on" >= "product_purchases"."bought_on")
);
--> statement-breakpoint
CREATE INDEX `product_purchases_created_by_idx` ON `product_purchases` (`created_by`);--> statement-breakpoint
CREATE INDEX `product_purchases_bar_id_product_id_bought_on_idx` ON `product_purchases` (`bar_id`,`product_id`,`bought_on`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_products` (
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
	`image_id` text,
	`status` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bar_id`,`category_id`) REFERENCES `categories`(`bar_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_country_check" CHECK("__new_products"."country" IS NULL OR "__new_products"."country" IN ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')),
	CONSTRAINT "products_status_check" CHECK("__new_products"."status" IS NULL OR "__new_products"."status" IN ('owned', 'finished', 'want_to_buy', 'want_to_try', 'tasted')),
	CONSTRAINT "products_abv_check" CHECK("__new_products"."abv" IS NULL OR "__new_products"."abv" BETWEEN 0 AND 100),
	CONSTRAINT "products_age_years_check" CHECK("__new_products"."age_years" IS NULL OR "__new_products"."age_years" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "bar_id", "category_id", "name", "producer", "country", "region", "abv", "vintage", "age_years", "description", "image_id", "status", "created_by", "created_at", "updated_at") SELECT "id", "bar_id", "category_id", "name", "producer", "country", "region", "abv", "vintage", "age_years", "description", "image_id", CASE WHEN "in_bar" THEN 'owned' END, "created_by", "created_at", "updated_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `products_created_by_idx` ON `products` (`created_by`);--> statement-breakpoint
CREATE INDEX `products_image_id_idx` ON `products` (`image_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_bar_id_id_unique` ON `products` (`bar_id`,`id`);--> statement-breakpoint
CREATE INDEX `products_bar_id_category_id_idx` ON `products` (`bar_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `products_bar_id_status_idx` ON `products` (`bar_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_vintage_name_unique` ON `products` (`bar_id`,larder_name_key("name"),`vintage`) WHERE "products"."vintage" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`bar_id`,larder_name_key("name")) WHERE "products"."vintage" IS NULL;