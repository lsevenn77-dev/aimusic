CREATE TABLE `crew_racing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`crew_id` text,
	`week` text NOT NULL,
	`course` text NOT NULL,
	`starts` integer NOT NULL,
	`score` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crew_racing_week` ON `crew_racing_runs` (`week`,`crew_id`,`user_id`,`score`);