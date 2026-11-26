CREATE TABLE `dubbing_script_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`issued_by` text NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dubbing_credit_amount" CHECK("dubbing_script_credits"."amount" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE INDEX `dubbing_credits_user` ON `dubbing_script_credits` (`user_id`,`created`);--> statement-breakpoint
ALTER TABLE `dubbing_generations` ADD `quota_source` text DEFAULT 'daily' NOT NULL;