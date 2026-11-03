CREATE TABLE `crew_fishing_casts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`crew_id` text NOT NULL,
	`nickname` text NOT NULL,
	`request_id` text NOT NULL,
	`day` text NOT NULL,
	`week` text NOT NULL,
	`fish` text NOT NULL,
	`grade` text NOT NULL,
	`length` integer NOT NULL,
	`amount` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer,
	`cycle_ms` integer NOT NULL,
	`goal` integer NOT NULL,
	`target` integer NOT NULL,
	`width` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`warnings` integer DEFAULT 0 NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`last_pass` integer DEFAULT -1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notice` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "fishing_status" CHECK(status IN ('active','caught','escaped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fishing_request` ON `crew_fishing_casts` (`user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fishing_active` ON `crew_fishing_casts` (`user_id`,`crew_id`,`day`) WHERE status='active';--> statement-breakpoint
CREATE INDEX `fishing_quota` ON `crew_fishing_casts` (`user_id`,`week`,`day`);--> statement-breakpoint
CREATE INDEX `fishing_weekly` ON `crew_fishing_casts` (`week`,`status`,`crew_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `fishing_collection` ON `crew_fishing_casts` (`crew_id`,`status`,`fish`,`length`);