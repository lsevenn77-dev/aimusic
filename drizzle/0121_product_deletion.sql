CREATE TABLE `product_asset_uploads` (
	`upload_id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_asset_upload_by_product` ON `product_asset_uploads` (`product_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `product_deletions` (
	`product_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`snapshot` text NOT NULL,
	`state` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`request_id` text NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`purge_request` text,
	`purge_actor` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`plan` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`completed_at` integer,
	CONSTRAINT "product_deletion_state" CHECK("product_deletions"."state" IN ('pending','ready','purging','failed','deleted'))
);
--> statement-breakpoint
CREATE INDEX `product_deletion_check` ON `product_deletions` (`state`,`checked_at`,`product_id`);--> statement-breakpoint
CREATE INDEX `product_deletion_work` ON `product_deletions` (`state`,`lease_until`,`requested_at`);--> statement-breakpoint
CREATE TABLE `product_history_assets` (
	`product_id` text NOT NULL,
	`version_id` text NOT NULL,
	`file` text NOT NULL,
	`object_key` text NOT NULL,
	`published_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `version_id`)
);
--> statement-breakpoint
CREATE INDEX `product_history_asset_object` ON `product_history_assets` (`object_key`);--> statement-breakpoint
ALTER TABLE `decoration_orders` ADD `product_name` text;--> statement-breakpoint
CREATE INDEX `decoration_order_product` ON `decoration_orders` (`sku`);--> statement-breakpoint
CREATE INDEX `free_gifts_product` ON `free_gifts` (`gift_type`);--> statement-breakpoint
CREATE INDEX `gift_dispatch_product_check` ON `gift_dispatch_items` (`state`,`dispatch_id`,`line`);--> statement-breakpoint
CREATE INDEX `gift_inventory_product` ON `gift_inventory` (`gift_type`,`used_at`);--> statement-breakpoint
CREATE INDEX `gifts_product` ON `gifts` (`gift_type`);--> statement-breakpoint
CREATE INDEX `player_equipment_inventory` ON `player_equipment` (`frame_inventory_id`);--> statement-breakpoint
CREATE INDEX `player_inventory_product` ON `player_inventory` (`item_key`,`source`,`revoked`);--> statement-breakpoint
CREATE INDEX `room_decoration_product` ON `room_decorations` (`sku`,`host_id`);--> statement-breakpoint
CREATE TRIGGER product_deletion_requested AFTER INSERT ON product_deletions
BEGIN
  INSERT INTO admin_audit(id,admin_id,action,target,created)
  VALUES(lower(hex(randomblob(16))),NEW.requested_by,'product_delete_requested',
    json_object('product_id',NEW.product_id,'name',NEW.name,'type',NEW.type,'request_id',NEW.request_id,
      'before',json_extract(NEW.snapshot,'$.previous'),'after',NEW.state,'result','success'),NEW.requested_at);
END;
--> statement-breakpoint
CREATE TRIGGER product_deletion_transition AFTER UPDATE OF state ON product_deletions WHEN OLD.state<>NEW.state
BEGIN
  INSERT INTO admin_audit(id,admin_id,action,target,created)
  VALUES(lower(hex(randomblob(16))),
    CASE WHEN NEW.state IN ('pending','ready') THEN 'system' ELSE NEW.purge_actor END,
    CASE NEW.state
      WHEN 'pending' THEN 'product_delete_waiting'
      WHEN 'ready' THEN 'product_delete_ready'
      WHEN 'purging' THEN CASE OLD.state WHEN 'failed' THEN 'product_delete_retry' ELSE 'product_delete_started' END
      WHEN 'failed' THEN 'product_delete_failed'
      WHEN 'deleted' THEN 'product_delete_completed'
    END,
    json_object('product_id',NEW.product_id,'name',NEW.name,'type',NEW.type,'request_id',coalesce(NEW.purge_request,NEW.request_id),
      'before',OLD.state,'after',NEW.state,'result',CASE NEW.state WHEN 'failed' THEN 'failed' ELSE 'success' END,
      'reason',NEW.last_error),unixepoch());
END;
--> statement-breakpoint
CREATE TRIGGER product_no_reinsert BEFORE INSERT ON product_catalog
WHEN EXISTS(SELECT 1 FROM product_deletions WHERE product_id=NEW.product_id AND state='deleted')
  AND json_extract(NEW.definition,'$.deletedAt') IS NULL
BEGIN
  SELECT RAISE(ABORT,'product_id_retired');
END;
--> statement-breakpoint
CREATE TRIGGER product_no_restore BEFORE UPDATE OF definition ON product_catalog
WHEN EXISTS(SELECT 1 FROM product_deletions WHERE product_id=NEW.product_id AND state='deleted')
  AND json_extract(NEW.definition,'$.deletedAt') IS NULL
BEGIN
  SELECT RAISE(ABORT,'product_id_retired');
END;
