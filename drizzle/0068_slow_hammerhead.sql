CREATE TABLE `crew_applications` (
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`crew_id`, `user_id`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crew_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crew_audit_time` ON `crew_audit` (`crew_id`,`created`);--> statement-breakpoint
CREATE TABLE `crew_growth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`collaboration` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crew_growth_period` ON `crew_growth_events` (`crew_id`,`created`);--> statement-breakpoint
CREATE TABLE `crew_missions` (
	`crew_id` text NOT NULL,
	`mission_key` text NOT NULL,
	`period_start` integer NOT NULL,
	`progress` integer NOT NULL,
	`target` integer NOT NULL,
	`reward` integer NOT NULL,
	PRIMARY KEY(`crew_id`, `mission_key`, `period_start`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `crew_notice_images` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`author_id` text NOT NULL,
	`notice_id` text,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notice_id`) REFERENCES `crew_notices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crew_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`author_id` text NOT NULL,
	`editor_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_artist_pins` (
	`producer_id` text PRIMARY KEY NOT NULL,
	`ids_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`producer_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `crews` ADD `highest_level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `growth_started` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `join_policy` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `minimum_level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `member_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crews` ADD `notice` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE crews SET growth_started=CAST(strftime('%s','now') AS INTEGER),highest_level=CASE WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0)>=3000 THEN 5 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0)>=1500 THEN 4 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0)>=500 THEN 3 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0)>=100 THEN 2 ELSE 1 END;
--> statement-breakpoint
CREATE TRIGGER crew_notice_pin_insert BEFORE INSERT ON crew_notices WHEN NEW.is_pinned=1 AND NEW.deleted_at=0 AND (SELECT count(*) FROM crew_notices WHERE crew_id=NEW.crew_id AND deleted_at=0 AND is_pinned=1)>=2 BEGIN SELECT RAISE(ABORT,'notice_pin_limit'); END;
--> statement-breakpoint
CREATE TRIGGER crew_notice_pin_update BEFORE UPDATE OF is_pinned ON crew_notices WHEN NEW.is_pinned=1 AND NEW.deleted_at=0 AND (SELECT count(*) FROM crew_notices WHERE crew_id=NEW.crew_id AND id!=NEW.id AND deleted_at=0 AND is_pinned=1)>=2 BEGIN SELECT RAISE(ABORT,'notice_pin_limit'); END;
