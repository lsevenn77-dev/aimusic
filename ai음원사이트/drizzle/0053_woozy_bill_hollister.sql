CREATE TABLE `dubbing_sound_assets` (
	`job_id` text NOT NULL,
	`cue_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`output_url` text,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`billing_json` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`job_id`, `cue_id`),
	FOREIGN KEY (`job_id`) REFERENCES `dubbing_sound_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dubbing_sound_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`script_key` text NOT NULL,
	`mode` text NOT NULL,
	`timeline_json` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_poll` integer DEFAULT 0 NOT NULL,
	`output_key` text,
	`output_meta` text,
	`error` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_sound_script` ON `dubbing_sound_jobs` (`project_id`,`script_key`);--> statement-breakpoint
CREATE INDEX `dubbing_sound_queue` ON `dubbing_sound_jobs` (`state`,`next_poll`,`lease_until`);