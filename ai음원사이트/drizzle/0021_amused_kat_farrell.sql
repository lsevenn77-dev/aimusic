ALTER TABLE `tracks` ADD `uploaded_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `tracks_upload_quota` ON `tracks` (`user_id`,`kind`,`uploaded_at`);