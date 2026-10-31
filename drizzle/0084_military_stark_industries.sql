CREATE TABLE `dubbing_audio_cleanup` (
	`object_key` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dubbing_casting_drafts` (
	`project_id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`target_id` text,
	`destination_id` text NOT NULL,
	`committed_id` text,
	`role_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dubbing_casting_drafts_root` ON `dubbing_casting_drafts` (`root_id`);--> statement-breakpoint
CREATE INDEX `dubbing_casting_drafts_committed` ON `dubbing_casting_drafts` (`committed_id`);--> statement-breakpoint
CREATE TABLE `dubbing_combinations` (
	`project_id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`last_participation` integer NOT NULL,
	`expired_at` integer DEFAULT 0 NOT NULL,
	`render_requested` integer DEFAULT 0 NOT NULL,
	`offsets_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dubbing_combinations_root` ON `dubbing_combinations` (`root_id`,`expired_at`);--> statement-breakpoint
CREATE INDEX `dubbing_combinations_expiry` ON `dubbing_combinations` (`expired_at`,`last_participation`);--> statement-breakpoint
CREATE TABLE `dubbing_recording_permissions` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`license_version` text DEFAULT '' NOT NULL,
	`accepted_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `dubbing_recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dubbing_recording_privacy" CHECK("dubbing_recording_permissions"."visibility" IN ('public','private'))
);
