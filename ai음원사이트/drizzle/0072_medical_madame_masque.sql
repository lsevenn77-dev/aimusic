CREATE TABLE `cover_compressions` (
	`track_id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`source_ext` text NOT NULL,
	`source_bytes` integer NOT NULL,
	`output_key` text DEFAULT '' NOT NULL,
	`output_bytes` integer DEFAULT 0 NOT NULL,
	`output_sha` text DEFAULT '' NOT NULL,
	`duration` real NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`requested_by` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cover_compression_queue` ON `cover_compressions` (`state`,`lease_until`);