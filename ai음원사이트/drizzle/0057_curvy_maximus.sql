CREATE TABLE `dubbing_final_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`script_key` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`manifest_json` text NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`output_key` text,
	`output_meta` text,
	`error` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_final_project` ON `dubbing_final_jobs` (`project_id`,`script_key`);--> statement-breakpoint
CREATE INDEX `dubbing_final_queue` ON `dubbing_final_jobs` (`state`,`lease_until`);--> statement-breakpoint
CREATE TABLE `dubbing_recording_lines` (
	`recording_id` text NOT NULL,
	`line_id` text NOT NULL,
	`take_id` text NOT NULL,
	`audio_key` text NOT NULL,
	`audio_hash` text NOT NULL,
	`duration` real NOT NULL,
	`bytes` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`recording_id`, `line_id`),
	FOREIGN KEY (`recording_id`) REFERENCES `dubbing_recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_recording_take` ON `dubbing_recording_lines` (`take_id`);--> statement-breakpoint
CREATE TABLE `dubbing_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role_id` text NOT NULL,
	`user_id` text NOT NULL,
	`script_key` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`write_token` text NOT NULL,
	`rights_at` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dubbing_recording_state" CHECK("dubbing_recordings"."state" IN ('draft','submitted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_recording_role` ON `dubbing_recordings` (`project_id`,`role_id`);