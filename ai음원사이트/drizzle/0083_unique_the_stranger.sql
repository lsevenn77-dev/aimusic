CREATE TABLE `artist_photo_likes` (
	`photo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`photo_id`, `user_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `artist_photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artist_photo_likes_user` ON `artist_photo_likes` (`user_id`);