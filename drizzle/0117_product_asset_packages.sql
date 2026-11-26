ALTER TABLE `product_asset_versions` ADD `package_metadata` text;--> statement-breakpoint
ALTER TABLE `product_asset_versions` ADD `upload_sha256` text;--> statement-breakpoint
ALTER TABLE `product_asset_versions` ADD `registered_by` text;--> statement-breakpoint
CREATE UNIQUE INDEX `product_asset_upload_hash` ON `product_asset_versions` (`product_id`,`upload_sha256`) WHERE upload_sha256 IS NOT NULL;--> statement-breakpoint
ALTER TABLE `room_decorations` ADD `asset_version` text;