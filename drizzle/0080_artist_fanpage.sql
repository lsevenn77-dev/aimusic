CREATE TABLE `artist_fan_likes` (
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `post_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `artist_fan_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artist_fan_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`parent_id` text,
	`request_id` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`edited` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artist_fan_kind" CHECK("artist_fan_posts"."kind" IN ('lounge','news'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_fan_request` ON `artist_fan_posts` (`artist_id`,`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `artist_fan_feed` ON `artist_fan_posts` (`artist_id`,`kind`,`parent_id`,`pinned`,`created`);--> statement-breakpoint
CREATE TABLE `artist_fan_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `artist_fan_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_fan_report_once` ON `artist_fan_reports` (`post_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `artist_fan_settings` (
	`artist_id` text PRIMARY KEY NOT NULL,
	`banner_version` text DEFAULT '' NOT NULL,
	`banner_type` text DEFAULT '' NOT NULL,
	`focus_x` real DEFAULT 50 NOT NULL,
	`focus_y` real DEFAULT 50 NOT NULL,
	`mobile_x` real DEFAULT 50 NOT NULL,
	`mobile_y` real DEFAULT 50 NOT NULL,
	`introduction` text DEFAULT '' NOT NULL,
	`concept` text DEFAULT '' NOT NULL,
	`world` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artist_photo_layout` (
	`photo_id` text PRIMARY KEY NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`carousel` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `artist_photos`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artist_photo_carousel" CHECK("artist_photo_layout"."carousel" IN (0,1))
);
