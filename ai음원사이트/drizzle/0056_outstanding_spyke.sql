CREATE TABLE `dubbing_ad_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`ad_unit` text NOT NULL,
	`source` text DEFAULT 'web_gpt_client' NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dubbing_ad_state" CHECK("dubbing_ad_sessions"."state" IN ('open','granted','cancelled','expired','capped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_ad_request` ON `dubbing_ad_sessions` (`request_id`);--> statement-breakpoint
CREATE INDEX `dubbing_ad_user_state` ON `dubbing_ad_sessions` (`user_id`,`state`);