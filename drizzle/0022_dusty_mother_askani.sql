CREATE TABLE `premium_audio_jobs` (
	`track_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`source_key` text DEFAULT '' NOT NULL,
	`output_key` text DEFAULT '' NOT NULL,
	`output_sha` text DEFAULT '' NOT NULL,
	`output_bytes` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`updated` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `premium_audio_queue` ON `premium_audio_jobs` (`state`,`lease_until`,`updated`);