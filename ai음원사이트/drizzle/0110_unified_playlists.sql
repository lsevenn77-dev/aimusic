CREATE TABLE `library_unification_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playlist_extra_items` (
	`playlist_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_id` text NOT NULL,
	`position` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `kind`, `content_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "playlist_extra_kind" CHECK("playlist_extra_items"."kind" IN ('original','cover','dubbing'))
);
--> statement-breakpoint
CREATE VIEW `playlist_items` AS SELECT pt.playlist_id,t.kind,pt.track_id AS content_id,pt.position,pt.created
 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id
 UNION ALL SELECT playlist_id,kind,content_id,position,created FROM playlist_extra_items;