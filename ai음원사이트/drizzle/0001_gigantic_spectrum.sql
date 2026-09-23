ALTER TABLE `artists` ADD `image_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `artists` ADD `image_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `producers` ADD `image_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `producers` ADD `image_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `cover_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `cover_type` text DEFAULT '' NOT NULL;