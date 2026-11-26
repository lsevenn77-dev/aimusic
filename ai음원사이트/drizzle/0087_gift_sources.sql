CREATE TABLE `gift_sources` (
	`currency` text NOT NULL,
	`gift_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_title` text NOT NULL,
	`work_kind` text,
	PRIMARY KEY(`currency`, `gift_id`)
);
