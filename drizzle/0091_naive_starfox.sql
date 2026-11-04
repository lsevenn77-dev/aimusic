CREATE TABLE `lyric_analysis_control` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`scan_done` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`last_batch_ms` integer DEFAULT 0 NOT NULL,
	`last_batch_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lyric_analysis_jobs` (
	`track_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`lyrics_hash` text DEFAULT '' NOT NULL,
	`analyzed_at` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`result_json` text DEFAULT '' NOT NULL,
	`duration_ms` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lyric_jobs_pending` ON `lyric_analysis_jobs` (`state`,`lease_until`,`updated`);--> statement-breakpoint
CREATE TABLE `lyric_search_tags` (
	`track_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`confidence` real NOT NULL,
	`role` text NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`track_id`, `tag_id`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lyric_confidence_range" CHECK("lyric_search_tags"."confidence">=0 AND "lyric_search_tags"."confidence"<=1)
);
--> statement-breakpoint
CREATE INDEX `lyric_tags_lookup` ON `lyric_search_tags` (`tag_id`,`track_id`);--> statement-breakpoint
CREATE TABLE `lyric_search_terms` (
	`track_id` text NOT NULL,
	`term` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`track_id`, `term`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lyric_terms_lookup` ON `lyric_search_terms` (`term`,`track_id`);--> statement-breakpoint
CREATE TABLE `lyric_tag_overrides` (
	`track_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`mode` text NOT NULL,
	`operator_id` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`track_id`, `tag_id`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lyric_override_mode" CHECK("lyric_tag_overrides"."mode" IN ('include','exclude'))
);
--> statement-breakpoint
-- Only enqueue: no lyric analysis or backfill runs inside a user write/migration.
CREATE TRIGGER lyric_analysis_track_insert AFTER INSERT ON tracks BEGIN
 INSERT INTO lyric_analysis_jobs(track_id,state,updated) VALUES(NEW.id,'queued',unixepoch());
END;
--> statement-breakpoint
CREATE TRIGGER lyric_analysis_track_update AFTER UPDATE OF lyrics,status,original_id,kind ON tracks
WHEN NEW.lyrics IS NOT OLD.lyrics OR (NEW.status='deleted')!=(OLD.status='deleted') OR NEW.original_id IS NOT OLD.original_id OR NEW.kind IS NOT OLD.kind BEGIN
 INSERT INTO lyric_analysis_jobs(track_id,state,updated) VALUES(NEW.id,'queued',unixepoch())
 ON CONFLICT(track_id) DO UPDATE SET state='queued',attempts=0,lease_token='',lease_until=0,error='',updated=excluded.updated;
 INSERT INTO lyric_analysis_jobs(track_id,state,updated) SELECT id,'queued',unixepoch() FROM tracks WHERE original_id=NEW.id AND kind='cover' AND status!='deleted'
 ON CONFLICT(track_id) DO UPDATE SET state='queued',attempts=0,lease_token='',lease_until=0,error='',updated=excluded.updated;
END;
