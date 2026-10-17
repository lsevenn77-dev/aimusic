ALTER TABLE `crews` ADD `name_changed_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `direct_messages` ADD `crew_invite_id` text REFERENCES crews(id) ON DELETE SET NULL;
