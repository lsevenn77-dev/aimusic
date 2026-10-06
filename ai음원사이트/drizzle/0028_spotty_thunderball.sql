CREATE TABLE `track_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_reports_reporter` ON `track_reports` (`track_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `track_reports_reason` ON `track_reports` (`track_id`,`reason`);