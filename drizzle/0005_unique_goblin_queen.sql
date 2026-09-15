ALTER TABLE `users` ADD `premium_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `playlist_selection` text DEFAULT '[]' NOT NULL;