ALTER TABLE `tracks` ADD `performance_mode` text DEFAULT 'solo' NOT NULL;
--> statement-breakpoint
-- Preserve the intent of duets created before song classification was introduced.
UPDATE tracks SET performance_mode='duet' WHERE kind='original' AND id IN (SELECT original_id FROM tracks WHERE kind='cover' AND cover_mode='duet');
