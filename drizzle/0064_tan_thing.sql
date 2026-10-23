CREATE TABLE `crew_applications` (
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`crew_id`, `user_id`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crew_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crew_audit_time` ON `crew_audit` (`crew_id`,`created`);--> statement-breakpoint
ALTER TABLE `crews` ADD `join_policy` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `minimum_level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `member_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `notice` text DEFAULT '' NOT NULL;