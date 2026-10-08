PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_free_gifts` (
	`recipient_profile_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`track_id` text,
	`request_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`recipient_profile_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_free_gifts`("recipient_profile_id", "id", "sender_id", "track_id", "request_id", "created") SELECT NULL, "id", "sender_id", "track_id", "request_id", "created" FROM `free_gifts`;--> statement-breakpoint
DROP TABLE `free_gifts`;--> statement-breakpoint
ALTER TABLE `__new_free_gifts` RENAME TO `free_gifts`;--> statement-breakpoint
--> statement-breakpoint
CREATE UNIQUE INDEX `free_gifts_request` ON `free_gifts` (`sender_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `free_gifts_track` ON `free_gifts` (`track_id`,`created`);--> statement-breakpoint
CREATE TABLE `__new_gifts` (
	`gift_type` text,
	`gift_name` text,
	`request_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`track_id` text,
	`gold` integer NOT NULL,
	`net_mw` integer NOT NULL,
	`singer_profile_id` text,
	`creator_profile_id` text NOT NULL,
	`singer_mw` integer DEFAULT 0 NOT NULL,
	`creator_mw` integer NOT NULL,
	`platform_mw` integer NOT NULL,
	`month` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_gifts`("gift_type", "gift_name", "request_id", "id", "sender_id", "track_id", "gold", "net_mw", "singer_profile_id", "creator_profile_id", "singer_mw", "creator_mw", "platform_mw", "month", "created") SELECT "gift_type", "gift_name", "request_id", "id", "sender_id", "track_id", "gold", "net_mw", "singer_profile_id", "creator_profile_id", "singer_mw", "creator_mw", "platform_mw", "month", "created" FROM `gifts`;--> statement-breakpoint
-- Move accounting children to the copied parent before replacing the old parent.
-- This preserves every historical lot, including purchases refunded after gifting.
CREATE TABLE `__new_gift_lots` (
 `gift_id` text NOT NULL,
 `purchase_id` text NOT NULL,
 `gold` integer NOT NULL,
 `net_mw` integer NOT NULL,
 PRIMARY KEY(`gift_id`, `purchase_id`),
 FOREIGN KEY (`gift_id`) REFERENCES `__new_gifts`(`id`) ON UPDATE no action ON DELETE no action,
 FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_gift_lots` SELECT * FROM `gift_lots`;
--> statement-breakpoint
DROP TABLE `gift_lots`;
--> statement-breakpoint
DROP TABLE `gifts`;--> statement-breakpoint
ALTER TABLE `__new_gifts` RENAME TO `gifts`;--> statement-breakpoint
ALTER TABLE `__new_gift_lots` RENAME TO `gift_lots`;
--> statement-breakpoint
CREATE TRIGGER play_refunded_gift_guard BEFORE INSERT ON gift_lots WHEN EXISTS(SELECT 1 FROM play_purchases WHERE 'play_'||token_hash=NEW.purchase_id AND state='refunded') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: refunded Play purchase'); END;
--> statement-breakpoint
CREATE INDEX `gifts_track` ON `gifts` (`track_id`,`created`);--> statement-breakpoint
CREATE INDEX `gifts_sender` ON `gifts` (`sender_id`,`created`);--> statement-breakpoint
CREATE INDEX `gifts_singer` ON `gifts` (`singer_profile_id`,`month`);--> statement-breakpoint
CREATE INDEX `gifts_creator` ON `gifts` (`creator_profile_id`,`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `gifts_request` ON `gifts` (`sender_id`,`request_id`);--> statement-breakpoint
ALTER TABLE `crew_members` ADD `muted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER push_gift AFTER INSERT ON gifts BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'gift:'||NEW.id||':'||p.user_id,p.user_id,CASE WHEN NEW.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(NEW.track_id,p.id),NEW.created FROM producers p WHERE (p.id=NEW.singer_profile_id OR p.id=NEW.creator_profile_id) AND p.user_id<>NEW.sender_id;
END;
--> statement-breakpoint
CREATE TRIGGER push_free_gift AFTER INSERT ON free_gifts BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'star:'||NEW.id,p.user_id,CASE WHEN NEW.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(NEW.track_id,p.id),NEW.created FROM producers p WHERE p.id=COALESCE(NEW.recipient_profile_id,(SELECT producer_id FROM tracks WHERE id=NEW.track_id)) AND p.user_id<>NEW.sender_id;
END;
--> statement-breakpoint
CREATE TRIGGER push_crew_message AFTER INSERT ON crew_messages WHEN NEW.kind='message' BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'crew:'||NEW.id||':'||m.user_id,m.user_id,'crew',NEW.crew_id,NEW.created FROM crew_members m WHERE m.crew_id=NEW.crew_id AND m.user_id<>NEW.user_id AND m.muted=0 AND NEW.rowid>=m.joined_sequence AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=m.user_id AND b.blocked_id=NEW.user_id) OR (b.user_id=NEW.user_id AND b.blocked_id=m.user_id));
END;
