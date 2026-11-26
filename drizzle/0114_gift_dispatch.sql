CREATE TABLE `gift_dispatch_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`dispatch_id` text NOT NULL,
	`admin_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text,
	`reason` text NOT NULL,
	`deadline` integer,
	`expires` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`dispatch_id`) REFERENCES `gift_dispatches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gift_dispatch_adjustments_dispatch` ON `gift_dispatch_adjustments` (`dispatch_id`,`confirmed_at`,`id`);--> statement-breakpoint
CREATE TABLE `gift_dispatch_effects` (
	`adjustment_id` text NOT NULL,
	`inventory_id` text NOT NULL,
	`type` text NOT NULL,
	`before_expires` integer,
	PRIMARY KEY(`adjustment_id`, `type`, `inventory_id`),
	FOREIGN KEY (`adjustment_id`) REFERENCES `gift_dispatch_adjustments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gift_dispatch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`dispatch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`line` integer NOT NULL,
	`state` text NOT NULL,
	`issue` text,
	`token` text,
	`granted_at` integer,
	`expires_at` integer,
	`notice_state` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`dispatch_id`) REFERENCES `gift_dispatches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_dispatch_member_line` ON `gift_dispatch_items` (`dispatch_id`,`user_id`,`line`);--> statement-breakpoint
CREATE INDEX `gift_dispatch_pending` ON `gift_dispatch_items` (`dispatch_id`,`state`,`id`);--> statement-breakpoint
CREATE INDEX `gift_dispatch_token` ON `gift_dispatch_items` (`dispatch_id`,`token`);--> statement-breakpoint
CREATE INDEX `gift_dispatch_arrivals` ON `gift_dispatch_items` (`dispatch_id`,`line`,`notice_state`,`id`);--> statement-breakpoint
CREATE TABLE `gift_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`check_id` text NOT NULL,
	`audience` text NOT NULL,
	`target_count` integer NOT NULL,
	`plan` text NOT NULL,
	`origin` text NOT NULL,
	`reason` text NOT NULL,
	`message` text NOT NULL,
	`test` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE INDEX `gift_dispatch_history` ON `gift_dispatches` (`test`,`confirmed_at`,`id`);--> statement-breakpoint
ALTER TABLE `gift_inventory` ADD `dispatch_item` text;--> statement-breakpoint
ALTER TABLE `gift_inventory` ADD `recalled_at` integer;--> statement-breakpoint
ALTER TABLE `gift_inventory` ADD `selected_for_send` text;--> statement-breakpoint
CREATE INDEX `gift_inventory_dispatch` ON `gift_inventory` (`dispatch_item`);--> statement-breakpoint
ALTER TABLE `player_inventory` ADD `period_code` text;--> statement-breakpoint
ALTER TABLE `player_inventory` ADD `redeem_before` integer;--> statement-breakpoint
ALTER TABLE `player_inventory` ADD `season_ends_at` integer;--> statement-breakpoint
ALTER TABLE `player_inventory` ADD `grant_terms` text;--> statement-breakpoint
ALTER TABLE `player_inventory` ADD `dispatch_item` text;--> statement-breakpoint
CREATE INDEX `player_inventory_dispatch` ON `player_inventory` (`dispatch_item`);
--> statement-breakpoint
CREATE TRIGGER gift_dispatch_use_guard BEFORE UPDATE OF used_at ON gift_inventory WHEN OLD.recalled_at IS NOT NULL OR OLD.expires_at<=unixepoch() BEGIN
 SELECT RAISE(ABORT,'inventory no longer available');
END;
--> statement-breakpoint
CREATE TRIGGER decoration_grant_deadline BEFORE INSERT ON decoration_redemptions WHEN EXISTS(
 SELECT 1 FROM player_inventory p WHERE p.id=NEW.inventory_id AND (p.redeem_before<=unixepoch() OR p.season_ends_at<=unixepoch())
) BEGIN
 SELECT RAISE(ABORT,'decoration_stock_deadline');
END;
--> statement-breakpoint
DROP TRIGGER room_theme_entitlement_insert;
--> statement-breakpoint
DROP TRIGGER room_theme_entitlement_update;
--> statement-breakpoint
CREATE TRIGGER room_theme_entitlement_insert AFTER INSERT ON room_decorations WHEN NEW.inventory_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.host_id AND pi.item_key=NEW.sku AND pi.source='decoration' AND pi.revoked=0 AND (pi.expires_at>unixepoch() OR (pi.expires_at=0 AND pi.period_code='PERMANENT')) AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'room_theme_expired') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_theme_entitlement_update AFTER UPDATE ON room_decorations WHEN NEW.inventory_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.host_id AND pi.item_key=NEW.sku AND pi.source='decoration' AND pi.revoked=0 AND (pi.expires_at>unixepoch() OR (pi.expires_at=0 AND pi.period_code='PERMANENT')) AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'room_theme_expired') END;
END;
