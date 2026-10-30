CREATE TABLE `artist_fan_operators` (
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`approved_by` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`),
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
