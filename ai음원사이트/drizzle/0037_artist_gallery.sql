CREATE TABLE `artist_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`image_version` text NOT NULL,
	`image_type` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artist_photos_artist_created` ON `artist_photos` (`artist_id`,`created`);