CREATE TABLE `admin_email_bugs` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`summary` text NOT NULL,
	`received_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`operator_id` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_email_bugs_received` ON `admin_email_bugs` (`received_at`);--> statement-breakpoint
CREATE TABLE `admin_test_gold_grants` (
	`request_id` text PRIMARY KEY NOT NULL,
	`operator_id` text NOT NULL,
	`user_id` text NOT NULL,
	`gold` integer NOT NULL,
	`reason` text NOT NULL,
	`payload_hash` text NOT NULL,
	`purchase_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "admin_test_gold_amount" CHECK("admin_test_gold_grants"."gold" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_test_gold_purchase` ON `admin_test_gold_grants` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `admin_test_gold_created` ON `admin_test_gold_grants` (`created`);