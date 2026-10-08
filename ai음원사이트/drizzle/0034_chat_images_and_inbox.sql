CREATE TABLE `chat_images` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_images_expiry` ON `chat_images` (`deleted`,`expires`);--> statement-breakpoint
CREATE TABLE `dm_settings` (
	`user_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`cleared_sequence` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `peer_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`peer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `crew_members` ADD `read_sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `image_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `direct_messages` ADD `image_id` text REFERENCES chat_images(id);