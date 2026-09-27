CREATE TABLE `free_gift_claims` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `free_gift_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "free_gift_balance" CHECK("free_gift_wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE `free_gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`track_id` text NOT NULL,
	`request_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `free_gifts_request` ON `free_gifts` (`sender_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `free_gifts_track` ON `free_gifts` (`track_id`,`created`);--> statement-breakpoint
ALTER TABLE `gifts` ADD `gift_type` text;--> statement-breakpoint
ALTER TABLE `gifts` ADD `gift_name` text;--> statement-breakpoint
ALTER TABLE `gifts` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `gifts_request` ON `gifts` (`sender_id`,`request_id`);