CREATE TABLE `playlist_preferences` (
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `playlist_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playlist_saves` (
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `playlist_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_saves_playlist` ON `playlist_saves` (`playlist_id`);--> statement-breakpoint
ALTER TABLE `playlists` ADD `description` text DEFAULT '' NOT NULL;