ALTER TABLE `dubbing_projects` ADD `root_id` text;--> statement-breakpoint
ALTER TABLE `dubbing_projects` ADD `deleted_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `dubbing_projects_root` ON `dubbing_projects` (`root_id`,`created`);