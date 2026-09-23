CREATE TABLE `karaoke_jobs` (
	`track_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`mr_source` text DEFAULT 'auto' NOT NULL,
	`mr_ext` text DEFAULT '' NOT NULL,
	`mr_bytes` integer DEFAULT 0 NOT NULL,
	`mr_ready` integer DEFAULT 0 NOT NULL,
	`vocals_ready` integer DEFAULT 0 NOT NULL,
	`lyrics_text` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'ko' NOT NULL,
	`words` text DEFAULT '' NOT NULL,
	`words_state` text DEFAULT 'none' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`error` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `karaoke_jobs_id` ON `karaoke_jobs` (`id`);--> statement-breakpoint
CREATE INDEX `karaoke_jobs_queue` ON `karaoke_jobs` (`state`,`lease_until`,`created`);