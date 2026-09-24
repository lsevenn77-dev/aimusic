CREATE TABLE `comment_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`body_snapshot` text NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_reports_reporter` ON `comment_reports` (`comment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `comment_reports_status` ON `comment_reports` (`status`,`created`);--> statement-breakpoint
ALTER TABLE `comments` ADD `deleted_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `deleted_by` text;--> statement-breakpoint
CREATE INDEX `likes_track_created` ON `likes` (`track_id`,`created`);