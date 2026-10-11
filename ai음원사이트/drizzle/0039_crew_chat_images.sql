CREATE TABLE `crew_chat_images` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crew_chat_images_expiry` ON `crew_chat_images` (`deleted`,`expires`);--> statement-breakpoint
ALTER TABLE `crew_messages` ADD `image_id` text REFERENCES crew_chat_images(id);