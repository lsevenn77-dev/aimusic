ALTER TABLE `playlist_tracks` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ordered AS (
 SELECT playlist_id,track_id,row_number() OVER (PARTITION BY playlist_id ORDER BY created,track_id)-1 AS next_position FROM playlist_tracks
)
UPDATE playlist_tracks SET position=(SELECT next_position FROM ordered WHERE ordered.playlist_id=playlist_tracks.playlist_id AND ordered.track_id=playlist_tracks.track_id);
