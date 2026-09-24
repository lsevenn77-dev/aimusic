CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_time` ON `admin_audit` (`created`);--> statement-breakpoint
CREATE TABLE `payout_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`bank` text NOT NULL,
	`account_last4` text NOT NULL,
	`account_cipher` text NOT NULL,
	`resident_hint` text NOT NULL,
	`resident_cipher` text NOT NULL,
	`consent_at` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payout_periods` (
	`period` text PRIMARY KEY NOT NULL,
	`closed_at` integer NOT NULL,
	`closed_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payout_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`from_month` text NOT NULL,
	`gross_krw` integer NOT NULL,
	`income_tax_krw` integer DEFAULT 0 NOT NULL,
	`local_tax_krw` integer DEFAULT 0 NOT NULL,
	`net_krw` integer NOT NULL,
	`status` text NOT NULL,
	`due_on` text NOT NULL,
	`paid_at` integer DEFAULT 0 NOT NULL,
	`paid_ref` text,
	`paid_by` text,
	`account_snapshot` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_statements_period` ON `payout_statements` (`profile_id`,`period`);--> statement-breakpoint
CREATE INDEX `payout_statements_status` ON `payout_statements` (`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `payout_statements_user` ON `payout_statements` (`user_id`);