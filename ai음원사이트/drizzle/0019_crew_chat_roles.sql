CREATE TABLE `crew_bans` (
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`crew_id`, `user_id`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `crew_messages` ADD `kind` text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_messages` ADD `author_role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- Apply the requested one-XP rule to already credited public tracks, preserving the ledger keys.
UPDATE crew_xp SET amount=1 WHERE id LIKE 'track:%';
