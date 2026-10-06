CREATE TABLE `play_purchases` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`purchase_token` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`expiry` integer DEFAULT 0 NOT NULL,
	`baseline_until` integer DEFAULT 0 NOT NULL,
	`last_granted` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `play_purchases_user` ON `play_purchases` (`user_id`,`kind`);
--> statement-breakpoint
CREATE TRIGGER play_refunded_gift_guard BEFORE INSERT ON gift_lots WHEN EXISTS(SELECT 1 FROM play_purchases WHERE 'play_'||token_hash=NEW.purchase_id AND state='refunded') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: refunded Play purchase'); END;
