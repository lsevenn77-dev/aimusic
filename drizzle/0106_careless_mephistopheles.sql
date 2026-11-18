CREATE TABLE `room_theme_applications` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`room_id` text NOT NULL,
	`action` text NOT NULL,
	`fingerprint` text NOT NULL,
	`revision` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `room_decorations` ADD `inventory_id` text REFERENCES player_inventory(id);--> statement-breakpoint
-- Link only an unambiguous legacy aggregate. Do not reconstruct or extend dates.
UPDATE room_decorations SET inventory_id=(SELECT pi.id FROM player_inventory pi WHERE pi.user_id=room_decorations.host_id AND pi.source='decoration' AND pi.source_ref=room_decorations.sku AND pi.item_key=room_decorations.sku);
--> statement-breakpoint
CREATE TRIGGER room_theme_revision_guard BEFORE INSERT ON room_theme_applications BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_decorations WHERE room_id=NEW.room_id AND revision>=NEW.revision) THEN RAISE(ABORT,'room_theme_stale_revision') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_theme_entitlement_insert AFTER INSERT ON room_decorations WHEN NEW.inventory_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.host_id AND pi.item_key=NEW.sku AND pi.source='decoration' AND pi.revoked=0 AND pi.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'room_theme_expired') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_theme_entitlement_update AFTER UPDATE ON room_decorations WHEN NEW.inventory_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=NEW.inventory_id AND pi.user_id=NEW.host_id AND pi.item_key=NEW.sku AND pi.source='decoration' AND pi.revoked=0 AND pi.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=pi.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=pi.id)) AND NOT (status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')))) THEN RAISE(ABORT,'room_theme_expired') END;
END;
