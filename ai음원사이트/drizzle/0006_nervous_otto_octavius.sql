CREATE TABLE `lyric_jobs` (
	`track_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`source_text` text NOT NULL,
	`language` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`result_lrc` text DEFAULT '' NOT NULL,
	`needs_attention` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`error` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lyric_jobs_id` ON `lyric_jobs` (`id`);--> statement-breakpoint
CREATE INDEX `lyric_jobs_queue` ON `lyric_jobs` (`state`,`lease_until`,`created`);