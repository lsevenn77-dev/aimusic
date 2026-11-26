CREATE TABLE `decoration_order_lots` (
	`order_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`gold` integer NOT NULL,
	`net_mw` integer NOT NULL,
	PRIMARY KEY(`order_id`, `purchase_id`),
	FOREIGN KEY (`order_id`) REFERENCES `decoration_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "decoration_lot_positive" CHECK("decoration_order_lots"."gold">0 AND "decoration_order_lots"."net_mw">=0)
);
--> statement-breakpoint
CREATE TABLE `decoration_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`payer_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`request_id` text NOT NULL,
	`sku` text NOT NULL,
	`period_code` text NOT NULL,
	`gold` integer NOT NULL,
	`inventory_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_id`) REFERENCES `player_inventory`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "decoration_price_positive" CHECK("decoration_orders"."gold">0),
	CONSTRAINT "decoration_period" CHECK("decoration_orders"."period_code" IN ('P7D','P1M','P3M'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decoration_order_request` ON `decoration_orders` (`payer_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `decoration_order_inventory` ON `decoration_orders` (`inventory_id`);--> statement-breakpoint
CREATE TABLE `decoration_redemptions` (
	`inventory_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`active_inventory_id` text NOT NULL,
	`previous_expires` integer NOT NULL,
	`previous_revoked` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `player_inventory`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_inventory_id`) REFERENCES `player_inventory`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decoration_redemption_request` ON `decoration_redemptions` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `decoration_redemption_active` ON `decoration_redemptions` (`active_inventory_id`);--> statement-breakpoint
CREATE TABLE `decoration_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`request_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `player_inventory`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decoration_transfer_request` ON `decoration_transfers` (`sender_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `room_decorations` (
	`room_id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`sku` text NOT NULL,
	`revision` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER decoration_order_inventory_guard BEFORE INSERT ON decoration_orders BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi JOIN users u ON u.id=pi.user_id WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.recipient_id AND pi.item_key=NEW.sku AND pi.source='decoration_stock' AND pi.revoked=0 AND u.provider!='deleted') THEN RAISE(ABORT,'decoration_stock_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER decoration_redemption_guard BEFORE INSERT ON decoration_redemptions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.user_id AND pi.source='decoration_stock' AND pi.revoked=0 AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'decoration_stock_changed') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory a JOIN player_inventory stock ON stock.id=NEW.inventory_id WHERE a.id=NEW.active_inventory_id AND a.user_id=NEW.user_id AND a.source='decoration' AND a.item_key=stock.item_key AND a.expires_at=NEW.previous_expires AND a.revoked=NEW.previous_revoked) THEN RAISE(ABORT,'decoration_inventory_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER decoration_transfer_guard BEFORE INSERT ON decoration_transfers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi JOIN users u ON u.id=NEW.recipient_id WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.sender_id AND pi.source='decoration_stock' AND pi.revoked=0 AND u.provider!='deleted' AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'decoration_stock_changed') END;
END;
