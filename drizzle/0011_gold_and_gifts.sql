CREATE TABLE `gift_lots` (
	`gift_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`gold` integer NOT NULL,
	`net_mw` integer NOT NULL,
	PRIMARY KEY(`gift_id`, `purchase_id`),
	FOREIGN KEY (`gift_id`) REFERENCES `gifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`track_id` text NOT NULL,
	`gold` integer NOT NULL,
	`net_mw` integer NOT NULL,
	`singer_profile_id` text,
	`creator_profile_id` text NOT NULL,
	`singer_mw` integer DEFAULT 0 NOT NULL,
	`creator_mw` integer NOT NULL,
	`platform_mw` integer NOT NULL,
	`month` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gifts_track` ON `gifts` (`track_id`,`created`);--> statement-breakpoint
CREATE INDEX `gifts_sender` ON `gifts` (`sender_id`,`created`);--> statement-breakpoint
CREATE INDEX `gifts_singer` ON `gifts` (`singer_profile_id`,`month`);--> statement-breakpoint
CREATE INDEX `gifts_creator` ON `gifts` (`creator_profile_id`,`month`);--> statement-breakpoint
CREATE TABLE `gold_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`gold` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`price_krw` integer NOT NULL,
	`fee_krw` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_ref` text,
	`created` integer NOT NULL,
	`paid_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gold_purchases_usage" CHECK("gold_purchases"."used" >= 0 AND "gold_purchases"."used" <= "gold_purchases"."gold" AND ("gold_purchases"."status" = 'paid' OR "gold_purchases"."used" = 0))
);
--> statement-breakpoint
CREATE INDEX `gold_purchases_user` ON `gold_purchases` (`user_id`,`status`,`paid_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `gold_purchases_ref` ON `gold_purchases` (`channel`,`provider_ref`);