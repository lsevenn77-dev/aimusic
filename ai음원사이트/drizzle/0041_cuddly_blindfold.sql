CREATE TABLE `creator_partners` (
	`user_id` text PRIMARY KEY NOT NULL,
	`basis` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`activated` integer NOT NULL,
	`reviewed_by` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `diamond_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_key` text NOT NULL,
	`amount_mw` integer NOT NULL,
	`eligible_mw` integer DEFAULT 0 NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`period` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diamond_source` ON `diamond_ledger` (`user_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `diamond_user` ON `diamond_ledger` (`user_id`,`created`);--> statement-breakpoint
CREATE TABLE `gift_exclusions` (
	`gift_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`gift_id`) REFERENCES `gifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stream_settlements` (
	`period` text PRIMARY KEY NOT NULL,
	`paid_krw` integer NOT NULL,
	`refunded_krw` integer NOT NULL,
	`fee_krw` integer NOT NULL,
	`tax_krw` integer NOT NULL,
	`pool_mw` integer NOT NULL,
	`allocated_mw` integer NOT NULL,
	`evidence` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`created` integer NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER diamond_spend_guard BEFORE INSERT ON diamond_ledger
WHEN NEW.kind IN ('exchange','payout') AND (NEW.amount_mw>=0 OR (SELECT COALESCE(sum(amount_mw),0) FROM diamond_ledger WHERE user_id=NEW.user_id)+NEW.amount_mw<0)
BEGIN SELECT RAISE(ABORT,'diamond_insufficient'); END;
