CREATE TABLE `dubbing_gold_lots` (
	`job_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`gold` integer NOT NULL,
	`refunded_gold` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`job_id`, `purchase_id`),
	FOREIGN KEY (`job_id`) REFERENCES `dubbing_gold_orders`(`job_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dubbing_gold_refund_range" CHECK("dubbing_gold_lots"."gold" > 0 AND "dubbing_gold_lots"."refunded_gold" >= 0 AND "dubbing_gold_lots"."refunded_gold" <= "dubbing_gold_lots"."gold")
);
--> statement-breakpoint
CREATE TABLE `dubbing_gold_orders` (
	`job_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`gold` integer NOT NULL,
	`state` text DEFAULT 'charged' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dubbing_gold_amount" CHECK("dubbing_gold_orders"."gold" > 0),
	CONSTRAINT "dubbing_gold_state_valid" CHECK("dubbing_gold_orders"."state" IN ('charged','fulfilled','refunded','refund_review'))
);
--> statement-breakpoint
CREATE INDEX `dubbing_gold_user` ON `dubbing_gold_orders` (`user_id`,`created`);--> statement-breakpoint
CREATE INDEX `dubbing_gold_state` ON `dubbing_gold_orders` (`state`);