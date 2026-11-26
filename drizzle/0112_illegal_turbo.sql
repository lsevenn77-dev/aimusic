CREATE TABLE `notice_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notice_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`data_json` text NOT NULL,
	`version` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notice_drafts_owner` ON `notice_drafts` (`owner_id`,`updated`);--> statement-breakpoint
CREATE TABLE `notice_rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`members_json` text NOT NULL,
	`version` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notice_rosters_updated` ON `notice_rosters` (`updated`);--> statement-breakpoint
CREATE TABLE `notice_target_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`audience_json` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notice_target_checks_expiry` ON `notice_target_checks` (`expires`);--> statement-breakpoint
CREATE TABLE `notice_target_members` (
	`check_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`check_id`, `user_id`),
	FOREIGN KEY (`check_id`) REFERENCES `notice_target_checks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notice_welcome_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`version` integer NOT NULL,
	`enabled` integer NOT NULL,
	`min_user_rowid` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `welcome_campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `kind` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `author_id` text;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `audience` text;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `request_hash` text;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `test` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `edit_json` text;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `edited_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_campaigns` ADD `withdrawn_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `official_notices_history` ON `welcome_campaigns` (`created`,`id`);--> statement-breakpoint
ALTER TABLE `welcome_receipts` ADD `withdrawn_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `official_receipts_timeline` ON `welcome_receipts` (`user_id`,`created`,`campaign_id`);