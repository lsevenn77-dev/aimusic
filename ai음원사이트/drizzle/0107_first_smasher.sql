CREATE TABLE `library_requests` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `library_write_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`allowed` integer NOT NULL,
	CONSTRAINT "library_guard_allowed" CHECK("library_write_guards"."allowed"=1)
);
--> statement-breakpoint
CREATE TABLE `my_box_items` (
	`box_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_id` text NOT NULL,
	`position` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`box_id`, `kind`, `content_id`),
	FOREIGN KEY (`box_id`) REFERENCES `my_boxes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "my_box_content_kind" CHECK("my_box_items"."kind" IN ('original','cover','dubbing'))
);
--> statement-breakpoint
CREATE INDEX `my_box_items_order` ON `my_box_items` (`box_id`,`position`,`kind`,`content_id`);--> statement-breakpoint
CREATE TABLE `my_boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`source_playlist_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `my_boxes_owner_updated` ON `my_boxes` (`user_id`,`updated`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `my_boxes_migration_source` ON `my_boxes` (`source_playlist_id`);--> statement-breakpoint
CREATE TABLE `playlist_recents` (
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`played` integer NOT NULL,
	PRIMARY KEY(`user_id`, `playlist_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_recents_user` ON `playlist_recents` (`user_id`,`played`);--> statement-breakpoint
CREATE TABLE `playlist_title_claims` (
	`key` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE `playlists` ADD `name_key` text;--> statement-breakpoint
ALTER TABLE `playlists` ADD `updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `playlists` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `playlists` ADD `source_id` text;--> statement-breakpoint
CREATE INDEX `playlists_name_key` ON `playlists` (`name_key`);--> statement-breakpoint
CREATE INDEX `playlists_owner_updated` ON `playlists` (`user_id`,`updated`,`id`);--> statement-breakpoint
CREATE INDEX `playlists_public_updated` ON `playlists` (`is_public`,`updated`,`id`);