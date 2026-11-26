CREATE TABLE `crew_rhythm_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`crew_id` text,
	`week` text NOT NULL,
	`day` text NOT NULL,
	`request_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`version` text NOT NULL,
	`starts` integer NOT NULL,
	`finished` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`score` integer,
	`max_combo` integer,
	`inputs` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "crew_rhythm_status" CHECK("crew_rhythm_runs"."status" IN ('active','finished','abandoned')),
	CONSTRAINT "crew_rhythm_difficulty" CHECK("crew_rhythm_runs"."difficulty" IN ('normal','hard','hell'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_rhythm_request` ON `crew_rhythm_runs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `crew_rhythm_daily` ON `crew_rhythm_runs` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `crew_rhythm_week` ON `crew_rhythm_runs` (`week`,`crew_id`,`user_id`,`score`);