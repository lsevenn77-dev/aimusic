CREATE TABLE `dubbing_plays` (
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`started` integer NOT NULL,
	PRIMARY KEY(`project_id`, `request_id`),
	FOREIGN KEY (`project_id`) REFERENCES `dubbing_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
