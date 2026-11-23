CREATE TABLE `visitor_days` (
	`day` integer NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`source` text,
	PRIMARY KEY(`day`, `platform`, `token`)
);
