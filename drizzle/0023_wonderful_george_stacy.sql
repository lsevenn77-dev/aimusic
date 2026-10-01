ALTER TABLE `tracks` ADD `cover_mode` text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `duet_parent_id` text REFERENCES tracks(id);--> statement-breakpoint
ALTER TABLE `tracks` ADD `duet_part` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `duet_open` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `tracks_duet_parent` ON `tracks` (`duet_parent_id`,`status`);--> statement-breakpoint
CREATE INDEX `tracks_duet_open` ON `tracks` (`cover_mode`,`duet_open`,`status`,`created`);