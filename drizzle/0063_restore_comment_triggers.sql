-- 0058 rebuilt comments for dubbing and dropped the existing track-comment triggers.
-- Restore their original behavior without rewriting comments, XP or notification history.
CREATE TRIGGER IF NOT EXISTS push_comment AFTER INSERT ON comments WHEN NEW.track_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'comment:'||NEW.id||':'||t.user_id,t.user_id,'comment',t.id,NEW.created FROM tracks t WHERE t.id=NEW.track_id AND t.user_id<>NEW.user_id;
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'comment:'||NEW.id||':'||c.user_id,c.user_id,'comment',NEW.track_id,NEW.created FROM comments c WHERE c.id=NEW.parent_id AND c.user_id<>NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS player_daily_comment AFTER INSERT ON comments WHEN NEW.deleted_at=0 AND EXISTS(SELECT 1 FROM tracks WHERE id=NEW.track_id AND user_id!=NEW.user_id AND status='published') BEGIN
 INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) VALUES(NEW.user_id,'comment:'||date('now','+9 hours'),'comment',5,unixepoch());
END;
