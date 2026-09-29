CREATE TABLE `crew_members` (
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined` integer NOT NULL,
	PRIMARY KEY(`crew_id`, `user_id`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_members_user` ON `crew_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `crew_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`request_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_messages_request` ON `crew_messages` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `crew_messages_time` ON `crew_messages` (`crew_id`,`created`);--> statement-breakpoint
CREATE TABLE `crew_xp` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crew_xp_crew` ON `crew_xp` (`crew_id`);--> statement-breakpoint
CREATE TABLE `crews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`recruiting` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crews_name` ON `crews` (`name`);--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`body` text NOT NULL,
	`request_id` text NOT NULL,
	`created` integer NOT NULL,
	`read_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `direct_messages_request` ON `direct_messages` (`sender_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `direct_messages_sender` ON `direct_messages` (`sender_id`,`recipient_id`,`created`);--> statement-breakpoint
CREATE INDEX `direct_messages_recipient` ON `direct_messages` (`recipient_id`,`created`);