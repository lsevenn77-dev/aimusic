ALTER TABLE `producers` ADD `banner_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `producers` ADD `banner_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `kind` text DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `original_id` text;--> statement-breakpoint
CREATE INDEX `tracks_original` ON `tracks` (`original_id`,`status`);