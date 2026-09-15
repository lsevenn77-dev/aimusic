CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`producer_id` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`genre` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`producer_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artists_producer` ON `artists` (`producer_id`);--> statement-breakpoint
CREATE TABLE `comment_likes` (
	`user_id` text NOT NULL,
	`comment_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `comment_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`timestamp` real,
	`created` integer NOT NULL,
	`edited` integer,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_track` ON `comments` (`track_id`,`created`);--> statement-breakpoint
CREATE TABLE `follows` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `target_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_target` ON `follows` (`kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `track_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `likes_track` ON `likes` (`track_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listens` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`listener` text NOT NULL,
	`user_id` text,
	`started` integer NOT NULL,
	`seconds` real DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`qualified` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listens_track_day` ON `listens` (`track_id`,`day`);--> statement-breakpoint
CREATE INDEX `listens_user_time` ON `listens` (`user_id`,`started`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `track_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_public` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlists_owner` ON `playlists` (`user_id`);--> statement-breakpoint
CREATE TABLE `producers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `producers_owner` ON `producers` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`producer_id` text NOT NULL,
	`title` text NOT NULL,
	`genre` text NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`ai_tool` text NOT NULL,
	`is_ai` integer DEFAULT 1 NOT NULL,
	`participation` text DEFAULT '' NOT NULL,
	`rights_accepted` integer NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`original_ext` text NOT NULL,
	`original_bytes` integer NOT NULL,
	`duration` real DEFAULT 0 NOT NULL,
	`has_cover` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`producer_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tracks_status_created` ON `tracks` (`status`,`created`);--> statement-breakpoint
CREATE INDEX `tracks_user` ON `tracks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tracks_artist` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `tracks_producer` ON `tracks` (`producer_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password` text,
	`provider` text DEFAULT 'email' NOT NULL,
	`subject` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_identity` ON `users` (`provider`,`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_provider` ON `users` (`email`,`provider`);