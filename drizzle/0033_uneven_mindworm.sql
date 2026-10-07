CREATE TABLE `account_file_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`targets` text NOT NULL,
	`ready_at` integer NOT NULL,
	`pass` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_file_deletions_ready` ON `account_file_deletions` (`ready_at`);--> statement-breakpoint
CREATE TABLE `apple_login_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cipher` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`user_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `blocked_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_blocks_reverse` ON `user_blocks` (`blocked_id`,`user_id`);