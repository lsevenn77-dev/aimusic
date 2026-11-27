ALTER TABLE `dubbing_projects` ADD `listening_template` text;--> statement-breakpoint
ALTER TABLE `dubbing_projects` ADD `listening_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `listening_template` text;