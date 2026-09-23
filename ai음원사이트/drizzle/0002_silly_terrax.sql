ALTER TABLE `tracks` ADD `lyrics` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `lyrics_mode` text DEFAULT 'none' NOT NULL;