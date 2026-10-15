CREATE TABLE `activity_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`source_title` text DEFAULT '' NOT NULL,
	`gift_name` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT '' NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`read_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_recipient_order` ON `activity_notifications` (`recipient`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `activity_recipient_unread` ON `activity_notifications` (`recipient`,`read_at`);
--> statement-breakpoint
-- History is independent of the short-lived push queue. Older gifts are read history,
-- so deployment never sends a burst of notifications about past transactions.
INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,gift_name,quantity,currency,amount,created,read_at)
SELECT 'gift:'||g.id||':'||p.user_id,p.user_id,g.sender_id,CASE WHEN g.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(g.track_id,p.id),COALESCE(t.title,''),COALESCE(g.gift_name,'골드 선물'),g.quantity,'gold',g.gold,g.created,MAX(1,g.created)
FROM gifts g JOIN producers p ON (p.id=g.singer_profile_id OR p.id=g.creator_profile_id) LEFT JOIN tracks t ON t.id=g.track_id WHERE p.user_id<>g.sender_id;
--> statement-breakpoint
INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,gift_name,quantity,currency,amount,created,read_at)
SELECT 'star:'||g.id,p.user_id,g.sender_id,CASE WHEN g.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(g.track_id,p.id),COALESCE(t.title,''),g.gift_name,g.quantity,'silver',g.silver,g.created,MAX(1,g.created)
FROM free_gifts g LEFT JOIN tracks t ON t.id=g.track_id JOIN producers p ON p.id=COALESCE(g.recipient_profile_id,t.producer_id) WHERE p.user_id<>g.sender_id;
--> statement-breakpoint
INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created,read_at)
SELECT 'participation:'||t.id||':'||p.user_id,p.user_id,t.user_id,'duet',t.id,p.title,t.created,MAX(1,t.created) FROM tracks t JOIN tracks p ON p.id=t.duet_parent_id WHERE t.kind='cover' AND t.status='published' AND p.user_id<>t.user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created,read_at)
SELECT 'participation:'||t.id||':'||o.user_id,o.user_id,t.user_id,'cover',t.id,o.title,t.created,MAX(1,t.created) FROM tracks t JOIN tracks o ON o.id=t.original_id WHERE t.kind='cover' AND t.status='published' AND o.user_id<>t.user_id;
--> statement-breakpoint
CREATE TRIGGER activity_gold_gift AFTER INSERT ON gifts BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,gift_name,quantity,currency,amount,created)
 SELECT 'gift:'||NEW.id||':'||p.user_id,p.user_id,NEW.sender_id,CASE WHEN NEW.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(NEW.track_id,p.id),COALESCE(t.title,''),COALESCE(NEW.gift_name,'골드 선물'),NEW.quantity,'gold',NEW.gold,NEW.created
 FROM producers p LEFT JOIN tracks t ON t.id=NEW.track_id WHERE (p.id=NEW.singer_profile_id OR p.id=NEW.creator_profile_id) AND p.user_id<>NEW.sender_id;
END;
--> statement-breakpoint
CREATE TRIGGER activity_silver_gift AFTER INSERT ON free_gifts BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,gift_name,quantity,currency,amount,created)
 SELECT 'star:'||NEW.id,p.user_id,NEW.sender_id,CASE WHEN NEW.track_id IS NULL THEN 'person_gift' ELSE 'gift' END,COALESCE(NEW.track_id,p.id),COALESCE(t.title,''),NEW.gift_name,NEW.quantity,'silver',NEW.silver,NEW.created
 FROM producers p LEFT JOIN tracks t ON t.id=NEW.track_id WHERE p.id=COALESCE(NEW.recipient_profile_id,t.producer_id) AND p.user_id<>NEW.sender_id;
END;
--> statement-breakpoint
-- Only a successful publication creates participation notifications; restoring a
-- hidden track or retrying transcoding cannot send the same notification twice.
CREATE TRIGGER activity_cover_published AFTER UPDATE OF status ON tracks WHEN NEW.status='published' AND OLD.status<>'published' AND NEW.kind='cover' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created)
 SELECT 'participation:'||NEW.id||':'||p.user_id,p.user_id,NEW.user_id,'duet',NEW.id,p.title,unixepoch()
 FROM tracks p WHERE p.id=NEW.duet_parent_id AND p.status='published' AND p.user_id<>NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=p.user_id AND b.blocked_id=NEW.user_id) OR (b.user_id=NEW.user_id AND b.blocked_id=p.user_id));
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created)
 SELECT 'participation:'||NEW.id||':'||o.user_id,o.user_id,NEW.user_id,'cover',NEW.id,o.title,unixepoch()
 FROM tracks o WHERE o.id=NEW.original_id AND o.status='published' AND o.user_id<>NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=o.user_id AND b.blocked_id=NEW.user_id) OR (b.user_id=NEW.user_id AND b.blocked_id=o.user_id));
END;
--> statement-breakpoint
CREATE TRIGGER activity_participation_push AFTER INSERT ON activity_notifications WHEN NEW.kind IN ('cover','duet') BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) VALUES(NEW.id,NEW.recipient,'participation',NEW.target,NEW.created);
END;
