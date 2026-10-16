ALTER TABLE `free_gifts` ADD `silver` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `free_gifts` ADD `gift_type` text DEFAULT 'star' NOT NULL;--> statement-breakpoint
ALTER TABLE `free_gifts` ADD `gift_name` text DEFAULT '은화' NOT NULL;--> statement-breakpoint
ALTER TABLE `free_gifts` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `gifts` ADD `quantity` integer DEFAULT 1 NOT NULL;