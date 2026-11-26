CREATE TABLE `crew_jump_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`crew_id` text,
	`week` text NOT NULL,
	`day` text NOT NULL,
	`request_id` text NOT NULL,
	`seed` text NOT NULL,
	`version` text NOT NULL,
	`starts` integer NOT NULL,
	`score` integer,
	`inputs` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_jump_request` ON `crew_jump_runs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `crew_jump_daily` ON `crew_jump_runs` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `crew_jump_week` ON `crew_jump_runs` (`week`,`crew_id`,`user_id`,`score`);