CREATE TABLE `artist_fan_likes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `artist_fan_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artist_fan_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`request_id` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artist_fan_kind" CHECK("artist_fan_posts"."kind" IN ('lounge','news')),
	CONSTRAINT "artist_fan_pinned" CHECK("artist_fan_posts"."pinned" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_fan_request` ON `artist_fan_posts` (`artist_id`,`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `artist_fan_feed` ON `artist_fan_posts` (`artist_id`,`kind`,`created`);--> statement-breakpoint
CREATE TABLE `artist_fan_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`body_snapshot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `artist_fan_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_fan_reporter` ON `artist_fan_reports` (`post_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `artist_fan_reports_pending` ON `artist_fan_reports` (`status`,`created`);--> statement-breakpoint
CREATE TABLE `artist_fanpages` (
	`artist_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`banner_version` text DEFAULT '' NOT NULL,
	`banner_type` text DEFAULT '' NOT NULL,
	`desktop_x` integer DEFAULT 50 NOT NULL,
	`desktop_y` integer DEFAULT 50 NOT NULL,
	`mobile_x` integer DEFAULT 50 NOT NULL,
	`mobile_y` integer DEFAULT 50 NOT NULL,
	`photo_order` text DEFAULT '[]' NOT NULL,
	`carousel_ids` text DEFAULT '[]' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`style` text DEFAULT '' NOT NULL,
	`world` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artist_operators` (
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`),
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
