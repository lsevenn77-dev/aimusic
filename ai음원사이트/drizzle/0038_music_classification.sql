CREATE TABLE `music_classification_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`result_json` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `music_classification_history` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `music_classification_history_track` ON `music_classification_history` (`track_id`,`created`);--> statement-breakpoint
CREATE TABLE `music_classification_jobs` (
	`track_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `music_classification_queue` ON `music_classification_jobs` (`state`,`lease_until`,`updated`);--> statement-breakpoint
ALTER TABLE `tracks` ADD `genres_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `moods_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `classification_source` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `classification_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `classification_revision` integer DEFAULT 0 NOT NULL;