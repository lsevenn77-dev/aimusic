CREATE TABLE `profile_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`producer_id` text NOT NULL,
	`image_version` text NOT NULL,
	`image_type` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`producer_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_photos_producer_created` ON `profile_photos` (`producer_id`,`created`);