CREATE TABLE `product_asset_reviews` (
	`product_id` text NOT NULL,
	`version_id` text NOT NULL,
	`platform` text NOT NULL,
	`surface` text NOT NULL,
	`build` text NOT NULL,
	`report` text NOT NULL,
	`passed` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`product_id`, `version_id`, `platform`, `surface`)
);
--> statement-breakpoint
CREATE TABLE `product_asset_versions` (
	`product_id` text NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`mode` text NOT NULL,
	`renderer` text NOT NULL,
	`files` text NOT NULL,
	`originals` text NOT NULL,
	`hash` text NOT NULL,
	`created` integer NOT NULL,
	`published_at` integer,
	PRIMARY KEY(`product_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_asset_version_label` ON `product_asset_versions` (`product_id`,`label`);--> statement-breakpoint
CREATE TABLE `product_catalog` (
	`product_id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`revision` integer NOT NULL,
	`active_version` text,
	`last_request` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `gift_inventory` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `gift_inventory` ADD `grant_terms` text;