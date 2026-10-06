CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_token` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_devices_user` ON `push_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL,
	`delivered` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_outbox_pending` ON `push_outbox` (`delivered`,`lease_until`,`created`);--> statement-breakpoint
CREATE TABLE `push_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`dm` integer DEFAULT 1 NOT NULL,
	`comment` integer DEFAULT 1 NOT NULL,
	`gift` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "push_dm_boolean" CHECK("push_preferences"."dm" IN (0,1)),
	CONSTRAINT "push_comment_boolean" CHECK("push_preferences"."comment" IN (0,1)),
	CONSTRAINT "push_gift_boolean" CHECK("push_preferences"."gift" IN (0,1))
);
--> statement-breakpoint
CREATE TRIGGER push_dm AFTER INSERT ON direct_messages WHEN NEW.sender_id<>NEW.recipient_id BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'dm:'||NEW.id,NEW.recipient_id,'dm',p.id,NEW.created FROM producers p WHERE p.user_id=NEW.sender_id;
END;
--> statement-breakpoint
CREATE TRIGGER push_comment AFTER INSERT ON comments BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'comment:'||NEW.id||':'||t.user_id,t.user_id,'comment',t.id,NEW.created FROM tracks t WHERE t.id=NEW.track_id AND t.user_id<>NEW.user_id;
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'comment:'||NEW.id||':'||c.user_id,c.user_id,'comment',NEW.track_id,NEW.created FROM comments c WHERE c.id=NEW.parent_id AND c.user_id<>NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER push_gift AFTER INSERT ON gifts BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'gift:'||NEW.id||':'||p.user_id,p.user_id,'gift',NEW.track_id,NEW.created FROM producers p WHERE (p.id=NEW.singer_profile_id OR p.id=NEW.creator_profile_id) AND p.user_id<>NEW.sender_id;
END;
--> statement-breakpoint
CREATE TRIGGER push_free_gift AFTER INSERT ON free_gifts BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'star:'||NEW.id,t.user_id,'gift',t.id,NEW.created FROM tracks t WHERE t.id=NEW.track_id AND t.user_id<>NEW.sender_id;
END;
