CREATE TABLE `welcome_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`content_json` text NOT NULL,
	`created` integer NOT NULL,
	`recipient_max_rowid` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `welcome_receipts` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	`read_at` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `welcome_campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "welcome_receipt_source" CHECK("welcome_receipts"."source" IN ('broadcast','automatic'))
);
--> statement-breakpoint
CREATE INDEX `welcome_receipts_unread` ON `welcome_receipts` (`user_id`,`read_at`);