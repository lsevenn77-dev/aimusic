CREATE TABLE `billing_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`tid` text,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`entitlement_end` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`last_checked` integer DEFAULT 0 NOT NULL,
	`submitted_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `billing_subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment_cycle` ON `billing_payments` (`subscription_id`,`cycle`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment_tid` ON `billing_payments` (`tid`);--> statement-breakpoint
CREATE INDEX `billing_payment_status` ON `billing_payments` (`status`,`last_checked`);--> statement-breakpoint
CREATE TABLE `billing_terms` (
	`version` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_worker` (
	`id` text PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`bid_cipher` text,
	`card_name` text DEFAULT '' NOT NULL,
	`cancel_requested` integer DEFAULT 0 NOT NULL,
	`period_start` integer DEFAULT 0 NOT NULL,
	`period_end` integer DEFAULT 0 NOT NULL,
	`cycle` integer DEFAULT 0 NOT NULL,
	`anchor_day` integer NOT NULL,
	`last_payment_id` text,
	`consent_version` text NOT NULL,
	`consent_at` integer NOT NULL,
	`price` integer NOT NULL,
	`baseline_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_subscription_user` ON `billing_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `billing_subscription_due` ON `billing_subscriptions` (`state`,`cancel_requested`,`period_end`);