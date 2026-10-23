CREATE TABLE `gift_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`gift_type` text NOT NULL,
	`gift_name` text NOT NULL,
	`currency` text NOT NULL,
	`value` integer NOT NULL,
	`source` text NOT NULL,
	`request_id` text NOT NULL,
	`unit` integer NOT NULL,
	`created` integer NOT NULL,
	`used_at` integer DEFAULT 0 NOT NULL,
	`send_request_id` text,
	`recipient_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `producers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gift_inventory_currency" CHECK("gift_inventory"."currency" IN ('gold','silver','reward')),
	CONSTRAINT "gift_inventory_value" CHECK("gift_inventory"."value">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_inventory_request_unit` ON `gift_inventory` (`user_id`,`request_id`,`unit`);--> statement-breakpoint
CREATE UNIQUE INDEX `gift_inventory_send_request` ON `gift_inventory` (`user_id`,`send_request_id`);--> statement-breakpoint
CREATE INDEX `gift_inventory_owner` ON `gift_inventory` (`user_id`,`used_at`);--> statement-breakpoint
CREATE TABLE `gift_inventory_lots` (
	`inventory_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`gold` integer NOT NULL,
	`net_mw` integer NOT NULL,
	PRIMARY KEY(`inventory_id`, `purchase_id`),
	FOREIGN KEY (`inventory_id`) REFERENCES `gift_inventory`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `gold_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gift_inventory_lot_positive" CHECK("gift_inventory_lots"."gold">0 AND "gift_inventory_lots"."net_mw">=0)
);
--> statement-breakpoint
CREATE TABLE `personal_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`first_user` text NOT NULL,
	`second_user` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`first_public` integer DEFAULT 0 NOT NULL,
	`second_public` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`first_user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "personal_relations_order" CHECK("personal_relations"."first_user"<"personal_relations"."second_user"),
	CONSTRAINT "personal_relations_requester" CHECK("personal_relations"."requested_by" IN ("personal_relations"."first_user","personal_relations"."second_user")),
	CONSTRAINT "personal_relations_state" CHECK("personal_relations"."state" IN ('pending','accepted','declined','ended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_relations_pair` ON `personal_relations` (`first_user`,`second_user`);--> statement-breakpoint
CREATE TABLE `relation_xp` (
	`relation_id` text NOT NULL,
	`source_key` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`relation_id`, `source_key`),
	FOREIGN KEY (`relation_id`) REFERENCES `personal_relations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "relation_xp_positive" CHECK("relation_xp"."amount">0)
);

--> statement-breakpoint
CREATE TRIGGER gift_inventory_lot_valid BEFORE INSERT ON gift_inventory_lots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM gold_purchases gp JOIN gift_inventory i ON i.id=NEW.inventory_id WHERE gp.id=NEW.purchase_id AND gp.user_id=i.user_id AND i.currency='gold' AND gp.status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gp.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gp.id AND pp.state='refunded')) THEN RAISE(ABORT,'inventory payment unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER gift_inventory_send_once BEFORE UPDATE OF used_at ON gift_inventory BEGIN
 SELECT CASE WHEN OLD.used_at!=0 OR NEW.used_at<=0 OR NEW.recipient_id IS NULL OR NEW.send_request_id IS NULL THEN RAISE(ABORT,'inventory already used') END;
 SELECT CASE WHEN OLD.currency='gold' AND (COALESCE((SELECT sum(gold) FROM gift_inventory_lots WHERE inventory_id=OLD.id),0)!=OLD.value OR EXISTS(SELECT 1 FROM gift_inventory_lots l JOIN gold_purchases gp ON gp.id=l.purchase_id WHERE l.inventory_id=OLD.id AND NOT (gp.status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gp.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gp.id AND pp.state='refunded')))) THEN RAISE(ABORT,'inventory payment unavailable') END;
END;

--> statement-breakpoint
CREATE TRIGGER direct_messages_relation_xp AFTER INSERT ON direct_messages BEGIN
 INSERT OR IGNORE INTO relation_xp(relation_id,source_key,kind,amount,created)
 SELECT r.id,'message:'||NEW.sender_id||':'||CAST((NEW.created+32400)/86400 AS INTEGER),'message',5,NEW.created
 FROM personal_relations r WHERE r.state='accepted' AND NEW.created>=r.updated
 AND ((r.first_user=NEW.sender_id AND r.second_user=NEW.recipient_id) OR (r.second_user=NEW.sender_id AND r.first_user=NEW.recipient_id))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user));
END;

--> statement-breakpoint
CREATE TRIGGER comments_relation_xp AFTER INSERT ON comments BEGIN
 INSERT OR IGNORE INTO relation_xp(relation_id,source_key,kind,amount,created)
 SELECT r.id,'comment:'||NEW.user_id||':'||CAST((NEW.created+32400)/86400 AS INTEGER),'comment',5,NEW.created
 FROM personal_relations r WHERE NEW.deleted_at=0 AND r.state='accepted' AND NEW.created>=r.updated
 AND ((r.first_user=NEW.user_id AND r.second_user=(SELECT user_id FROM tracks WHERE id=NEW.track_id)) OR (r.second_user=NEW.user_id AND r.first_user=(SELECT user_id FROM tracks WHERE id=NEW.track_id)))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user));
END;

--> statement-breakpoint
CREATE TRIGGER likes_relation_xp AFTER INSERT ON likes BEGIN
 INSERT OR IGNORE INTO relation_xp(relation_id,source_key,kind,amount,created)
 SELECT r.id,'like:'||NEW.user_id||':'||CAST((NEW.created+32400)/86400 AS INTEGER),'like',1,NEW.created
 FROM personal_relations r WHERE r.state='accepted' AND NEW.created>=r.updated
 AND ((r.first_user=NEW.user_id AND r.second_user=(SELECT user_id FROM tracks WHERE id=NEW.track_id)) OR (r.second_user=NEW.user_id AND r.first_user=(SELECT user_id FROM tracks WHERE id=NEW.track_id)))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user));
END;

--> statement-breakpoint
CREATE TRIGGER gifts_relation_xp AFTER INSERT ON gifts BEGIN
 INSERT OR IGNORE INTO relation_xp(relation_id,source_key,kind,amount,created)
 SELECT r.id,'gift:'||NEW.sender_id||':'||CAST((NEW.created+32400)/86400 AS INTEGER),'gift',5,NEW.created
 FROM personal_relations r WHERE r.state='accepted' AND NEW.created>=r.updated
 AND ((r.first_user=NEW.sender_id AND r.second_user=(SELECT user_id FROM producers WHERE id=COALESCE(NEW.singer_profile_id,NEW.creator_profile_id))) OR (r.second_user=NEW.sender_id AND r.first_user=(SELECT user_id FROM producers WHERE id=COALESCE(NEW.singer_profile_id,NEW.creator_profile_id))))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user));
END;

--> statement-breakpoint
CREATE TRIGGER free_gifts_relation_xp AFTER INSERT ON free_gifts BEGIN
 INSERT OR IGNORE INTO relation_xp(relation_id,source_key,kind,amount,created)
 SELECT r.id,'gift:'||NEW.sender_id||':'||CAST((NEW.created+32400)/86400 AS INTEGER),'gift',5,NEW.created
 FROM personal_relations r WHERE r.state='accepted' AND NEW.created>=r.updated
 AND ((r.first_user=NEW.sender_id AND r.second_user=(SELECT user_id FROM producers WHERE id=COALESCE(NEW.recipient_profile_id,(SELECT producer_id FROM tracks WHERE id=NEW.track_id)))) OR (r.second_user=NEW.sender_id AND r.first_user=(SELECT user_id FROM producers WHERE id=COALESCE(NEW.recipient_profile_id,(SELECT producer_id FROM tracks WHERE id=NEW.track_id)))))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user));
END;
