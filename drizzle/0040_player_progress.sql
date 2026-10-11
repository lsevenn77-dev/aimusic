CREATE TABLE `player_equipment` (
	`user_id` text PRIMARY KEY NOT NULL,
	`frame_inventory_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`frame_inventory_id`) REFERENCES `player_inventory`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `player_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_key` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_inventory_grant` ON `player_inventory` (`user_id`,`source`,`source_ref`);--> statement-breakpoint
CREATE INDEX `player_inventory_user` ON `player_inventory` (`user_id`);--> statement-breakpoint
CREATE TABLE `player_xp` (
	`user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user_id`, `source_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "player_xp_positive" CHECK("player_xp"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `player_xp_recent` ON `player_xp` (`user_id`,`created`);
--> statement-breakpoint
CREATE TRIGGER player_publish_insert AFTER INSERT ON tracks WHEN NEW.status='published' BEGIN INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'track:'||NEW.id,iif(NEW.kind='cover','cover','publish'),iif(NEW.kind='cover',60,100),unixepoch()); END;
--> statement-breakpoint
CREATE TRIGGER player_publish_update AFTER UPDATE OF status ON tracks WHEN NEW.status='published' AND OLD.status!='published' BEGIN INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'track:'||NEW.id,iif(NEW.kind='cover','cover','publish'),iif(NEW.kind='cover',60,100),unixepoch()); END;
--> statement-breakpoint
CREATE TRIGGER player_daily_listen AFTER UPDATE OF qualified ON listens WHEN NEW.qualified=1 AND OLD.qualified=0 AND NEW.user_id IS NOT NULL BEGIN INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'listen:'||date('now','+9 hours'),'listen',10,unixepoch()); END;
--> statement-breakpoint
CREATE TRIGGER player_daily_comment AFTER INSERT ON comments WHEN NEW.deleted_at=0 AND EXISTS(SELECT 1 FROM tracks WHERE id=NEW.track_id AND user_id!=NEW.user_id AND status='published') BEGIN INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'comment:'||date('now','+9 hours'),'comment',5,unixepoch()); END;
--> statement-breakpoint
CREATE TRIGGER player_daily_crew_chat AFTER INSERT ON crew_messages WHEN NEW.kind!='system' AND EXISTS(SELECT 1 FROM crew_members WHERE crew_id=NEW.crew_id AND user_id=NEW.user_id) BEGIN INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'crew_chat:'||date('now','+9 hours'),'crew_chat',5,unixepoch()); END;
--> statement-breakpoint
CREATE TRIGGER player_crew_join AFTER INSERT ON crew_members BEGIN INSERT OR IGNORE INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES('crew-frame:'||NEW.user_id,NEW.user_id,'crew-outline','crew','membership',unixepoch()); INSERT OR IGNORE INTO player_equipment(user_id,frame_inventory_id) VALUES(NEW.user_id,'crew-frame:'||NEW.user_id); END;
--> statement-breakpoint
CREATE TRIGGER player_crew_leave AFTER DELETE ON crew_members BEGIN UPDATE player_equipment SET frame_inventory_id=NULL WHERE user_id=OLD.user_id AND frame_inventory_id IN(SELECT id FROM player_inventory WHERE user_id=OLD.user_id AND item_key='crew-outline'); END;
--> statement-breakpoint
