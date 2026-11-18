CREATE TABLE `song_cover_picks` (
	`original_id` text PRIMARY KEY NOT NULL,
	`cover_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated` integer NOT NULL,
	FOREIGN KEY (`original_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cover_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "song_cover_picks_revision" CHECK("song_cover_picks"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `song_cover_picks_cover` ON `song_cover_picks` (`cover_id`);
--> statement-breakpoint
-- Visibility invalidation is part of the same transaction as the moderation
-- or publication change. Viewer-specific blocks never touch this table.
CREATE TRIGGER song_cover_pick_visibility AFTER UPDATE OF status,kind,original_id,cover_mode,duet_parent_id,duet_open,karaoke_at ON tracks
BEGIN
 UPDATE song_cover_picks SET cover_id=NULL,revision=revision+1,updated=unixepoch()
 WHERE cover_id IS NOT NULL AND (original_id=NEW.id OR cover_id=NEW.id OR cover_id IN (SELECT id FROM tracks WHERE duet_parent_id=NEW.id))
 AND NOT EXISTS (
  SELECT 1 FROM tracks c JOIN tracks o ON o.id=c.original_id
  WHERE c.id=song_cover_picks.cover_id AND o.id=song_cover_picks.original_id
  AND o.kind='original' AND o.status='published' AND o.karaoke_at>0 AND c.status='published' AND c.kind='cover'
  AND (c.cover_mode='solo' OR (c.cover_mode='duet' AND c.duet_parent_id IS NOT NULL AND c.duet_open=0))
  AND (c.duet_parent_id IS NULL OR EXISTS(SELECT 1 FROM tracks dp WHERE dp.id=c.duet_parent_id AND dp.status='published' AND dp.cover_mode='duet' AND dp.duet_parent_id IS NULL))
 );
END;
--> statement-breakpoint
CREATE TRIGGER song_cover_pick_delete BEFORE DELETE ON tracks
BEGIN
 UPDATE song_cover_picks SET cover_id=NULL,revision=revision+1,updated=unixepoch()
 WHERE cover_id=OLD.id OR cover_id IN (SELECT id FROM tracks WHERE duet_parent_id=OLD.id);
END;
