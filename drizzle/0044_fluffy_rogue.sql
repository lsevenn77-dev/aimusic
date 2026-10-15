CREATE TABLE `chart_daily_snapshots` (
	`day` text NOT NULL,
	`period` text NOT NULL,
	`captured` integer NOT NULL,
	`ranks_json` text NOT NULL,
	PRIMARY KEY(`day`, `period`)
);
