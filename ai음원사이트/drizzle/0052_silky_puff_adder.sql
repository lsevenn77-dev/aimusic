CREATE TABLE `dubbing_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`state` text NOT NULL,
	`result_json` text,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dubbing_generations_user` ON `dubbing_generations` (`user_id`,`created`);--> statement-breakpoint
CREATE TABLE `dubbing_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`options_json` text NOT NULL,
	`script_json` text NOT NULL,
	`script_key` text NOT NULL,
	`creation_hash` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`generation_id` text,
	`state` text DEFAULT 'script_ready' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`role_count` integer NOT NULL,
	`duration` real NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`write_token` text NOT NULL,
	`rights_at` integer DEFAULT 0 NOT NULL,
	`first_recorded_at` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dubbing_roles_range" CHECK("dubbing_projects"."role_count" BETWEEN 1 AND 6),
	CONSTRAINT "dubbing_duration_range" CHECK("dubbing_projects"."duration" > 0 AND "dubbing_projects"."duration" <= 300)
);
--> statement-breakpoint
CREATE INDEX `dubbing_projects_owner` ON `dubbing_projects` (`owner_id`,`updated`);--> statement-breakpoint
CREATE INDEX `dubbing_projects_browse` ON `dubbing_projects` (`visibility`,`state`,`created`);--> statement-breakpoint
CREATE TABLE `dubbing_role_claims` (
	`project_id` text NOT NULL,
	`role_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`project_id`, `role_id`),
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dubbing_one_role_per_user` ON `dubbing_role_claims` (`project_id`,`user_id`);