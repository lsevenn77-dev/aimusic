CREATE TABLE `gold_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`state` text DEFAULT 'created' NOT NULL,
	`review_only` integer DEFAULT 0 NOT NULL,
	`tid` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`updated` integer NOT NULL,
	`last_checked` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gold_orders_request` ON `gold_orders` (`user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gold_orders_tid` ON `gold_orders` (`tid`);--> statement-breakpoint
CREATE INDEX `gold_orders_reconcile` ON `gold_orders` (`state`,`last_checked`);
--> statement-breakpoint
CREATE TRIGGER gold_checkout_spend_guard BEFORE UPDATE OF used ON gold_purchases
WHEN NEW.used>OLD.used AND EXISTS(SELECT 1 FROM gold_orders WHERE id=NEW.id AND state!='paid')
BEGIN SELECT RAISE(ABORT,'CHECK constraint failed: gold checkout is not spendable'); END;
