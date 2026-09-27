CREATE TABLE `original_archives` (
	`track_id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`source_bytes` integer NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`output_key` text DEFAULT '' NOT NULL,
	`output_bytes` integer DEFAULT 0 NOT NULL,
	`output_sha` text DEFAULT '' NOT NULL,
	`pcm_sha` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `original_archives_queue` ON `original_archives` (`state`,`lease_until`);--> statement-breakpoint
ALTER TABLE `tracks` ADD `original_key` text DEFAULT '' NOT NULL;