ALTER TABLE `crews` ADD `primary_activity` text;--> statement-breakpoint
ALTER TABLE `crews` ADD `additional_activities` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `music_genres` text DEFAULT '[]' NOT NULL;