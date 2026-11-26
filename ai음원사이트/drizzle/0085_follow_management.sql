CREATE TABLE `artist_follow_blocks` (
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`direction` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`, `direction`),
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artist_block_direction" CHECK("artist_follow_blocks"."direction" IN ('fan','artist'))
);
--> statement-breakpoint
CREATE INDEX `artist_follow_blocks_user` ON `artist_follow_blocks` (`user_id`,`direction`);--> statement-breakpoint
-- All entry points, including the existing DM block action, get atomic edge removal.
CREATE TRIGGER follow_personal_block AFTER INSERT ON user_blocks BEGIN
 DELETE FROM follows WHERE
 (user_id=NEW.user_id AND ((kind='member' AND target_id=NEW.blocked_id) OR (kind='producer' AND target_id IN (SELECT id FROM producers WHERE user_id=NEW.blocked_id)) OR (kind='artist' AND target_id IN (SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=NEW.blocked_id)))) OR
 (user_id=NEW.blocked_id AND ((kind='member' AND target_id=NEW.user_id) OR (kind='producer' AND target_id IN (SELECT id FROM producers WHERE user_id=NEW.user_id)) OR (kind='artist' AND target_id IN (SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=NEW.user_id))));
 DELETE FROM ai_support_follows WHERE (owner_id=NEW.user_id AND bot_id=NEW.blocked_id) OR (owner_id=NEW.blocked_id AND bot_id=NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER follow_artist_block AFTER INSERT ON artist_follow_blocks BEGIN
 DELETE FROM follows WHERE kind='artist' AND target_id=NEW.artist_id AND user_id=NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER follow_reject_block BEFORE INSERT ON follows WHEN
 EXISTS(SELECT 1 FROM artist_follow_blocks WHERE NEW.kind='artist' AND artist_id=NEW.target_id AND user_id=NEW.user_id) OR
 EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=NEW.user_id OR b.blocked_id=NEW.user_id) AND
 CASE WHEN b.user_id=NEW.user_id THEN b.blocked_id ELSE b.user_id END = CASE NEW.kind WHEN 'member' THEN NEW.target_id WHEN 'producer' THEN (SELECT user_id FROM producers WHERE id=NEW.target_id) WHEN 'artist' THEN (SELECT p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=NEW.target_id) END)
 BEGIN SELECT RAISE(ABORT,'blocked follow'); END;
--> statement-breakpoint
-- A listener can receive a follow before choosing a producer nickname.
CREATE TRIGGER follow_promote_member AFTER INSERT ON producers BEGIN
 UPDATE follows SET kind='producer',target_id=NEW.id WHERE kind='member' AND target_id=NEW.user_id;
END;


--> statement-breakpoint
-- Older app versions only hid edges on block. Never resurrect those edges on unblock.
CREATE TRIGGER follow_legacy_unblock BEFORE DELETE ON user_blocks BEGIN
 DELETE FROM follows WHERE
 (user_id=OLD.user_id AND ((kind='member' AND target_id=OLD.blocked_id) OR (kind='producer' AND target_id IN (SELECT id FROM producers WHERE user_id=OLD.blocked_id)) OR (kind='artist' AND target_id IN (SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=OLD.blocked_id)))) OR
 (user_id=OLD.blocked_id AND ((kind='member' AND target_id=OLD.user_id) OR (kind='producer' AND target_id IN (SELECT id FROM producers WHERE user_id=OLD.user_id)) OR (kind='artist' AND target_id IN (SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=OLD.user_id))));
 DELETE FROM ai_support_follows WHERE (owner_id=OLD.user_id AND bot_id=OLD.blocked_id) OR (owner_id=OLD.blocked_id AND bot_id=OLD.user_id);
END;
