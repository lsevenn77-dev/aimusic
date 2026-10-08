CREATE TABLE `apple_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apple_accounts_token` ON `apple_accounts` (`token`);--> statement-breakpoint
CREATE TABLE `apple_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`transaction_id` text NOT NULL,
	`original_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`purchased` integer NOT NULL,
	`expires` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`signed_date` integer NOT NULL,
	`refund_review` integer DEFAULT 0 NOT NULL,
	`refunded_used` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apple_transaction_unique` ON `apple_transactions` (`environment`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `apple_transaction_user` ON `apple_transactions` (`user_id`,`environment`,`expires`);--> statement-breakpoint
CREATE INDEX `apple_transaction_original` ON `apple_transactions` (`environment`,`original_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `apple_premium_until` integer DEFAULT 0 NOT NULL;