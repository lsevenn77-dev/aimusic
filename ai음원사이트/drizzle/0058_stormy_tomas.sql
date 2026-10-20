CREATE TABLE `dubbing_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`sound_gold` integer DEFAULT 50 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "dubbing_settings_singleton" CHECK("dubbing_settings"."key" = 'default'),
	CONSTRAINT "dubbing_settings_price" CHECK("dubbing_settings"."sound_gold" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_likes` (
	`user_id` text NOT NULL,
	`track_id` text,
	`dubbing_id` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dubbing_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "likes_one_target" CHECK(("__new_likes"."track_id" IS NOT NULL) != ("__new_likes"."dubbing_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_likes`("user_id", "track_id", "dubbing_id", "created") SELECT "user_id", "track_id", NULL, "created" FROM `likes`;--> statement-breakpoint
DROP TABLE `likes`;--> statement-breakpoint
ALTER TABLE `__new_likes` RENAME TO `likes`;--> statement-breakpoint
CREATE UNIQUE INDEX `likes_user_track` ON `likes` (`user_id`,`track_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `likes_user_dubbing` ON `likes` (`user_id`,`dubbing_id`);--> statement-breakpoint
CREATE INDEX `likes_track` ON `likes` (`track_id`);--> statement-breakpoint
CREATE INDEX `likes_track_created` ON `likes` (`track_id`,`created`);--> statement-breakpoint
-- D1 keeps foreign keys enabled: preserve dependent rows across the table rebuild.
CREATE TABLE `__dubbing_comment_likes_backup` AS SELECT * FROM `comment_likes`;
--> statement-breakpoint
CREATE TABLE `__dubbing_comment_reports_backup` AS SELECT * FROM `comment_reports`;
--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text,
	`dubbing_id` text,
	`user_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`timestamp` real,
	`created` integer NOT NULL,
	`edited` integer,
	`deleted_at` integer DEFAULT 0 NOT NULL,
	`deleted_by` text,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dubbing_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_one_target" CHECK(("__new_comments"."track_id" IS NOT NULL) != ("__new_comments"."dubbing_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "track_id", "dubbing_id", "user_id", "parent_id", "body", "timestamp", "created", "edited", "deleted_at", "deleted_by") SELECT "id", "track_id", NULL, "user_id", "parent_id", "body", "timestamp", "created", "edited", "deleted_at", "deleted_by" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
INSERT OR IGNORE INTO `comment_likes` SELECT * FROM `__dubbing_comment_likes_backup`;
--> statement-breakpoint
INSERT OR IGNORE INTO `comment_reports` SELECT * FROM `__dubbing_comment_reports_backup`;
--> statement-breakpoint
DROP TABLE `__dubbing_comment_likes_backup`;
--> statement-breakpoint
DROP TABLE `__dubbing_comment_reports_backup`;
--> statement-breakpoint
CREATE INDEX `comments_track` ON `comments` (`track_id`,`created`);--> statement-breakpoint
CREATE INDEX `comments_dubbing` ON `comments` (`dubbing_id`,`created`);--> statement-breakpoint
CREATE TABLE `__new_track_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text,
	`dubbing_id` text,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`rightsholder` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision` text DEFAULT '' NOT NULL,
	`appeal` text DEFAULT '' NOT NULL,
	`appeal_evidence_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`resolved_by` text,
	`resolved_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dubbing_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_one_target" CHECK(("__new_track_reports"."track_id" IS NOT NULL) != ("__new_track_reports"."dubbing_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_track_reports`("id", "track_id", "dubbing_id", "user_id", "reason", "details", "created", "rightsholder", "contact", "evidence_json", "status", "decision", "appeal", "appeal_evidence_json", "version", "resolved_by", "resolved_at") SELECT "id", "track_id", NULL, "user_id", "reason", "details", "created", '', '', '[]', 'pending', '', '', '[]', 1, NULL, 0 FROM `track_reports`;--> statement-breakpoint
DROP TABLE `track_reports`;--> statement-breakpoint
ALTER TABLE `__new_track_reports` RENAME TO `track_reports`;--> statement-breakpoint
CREATE UNIQUE INDEX `track_reports_reporter` ON `track_reports` (`track_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `track_reports_reason` ON `track_reports` (`track_id`,`reason`);--> statement-breakpoint
CREATE UNIQUE INDEX `reports_dubbing_reporter` ON `track_reports` (`dubbing_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `reports_dubbing_status` ON `track_reports` (`dubbing_id`,`status`);
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
