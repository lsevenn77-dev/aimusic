-- Record new social events only. Existing notification history is preserved.
CREATE TRIGGER activity_profile_comment AFTER INSERT ON comments WHEN NEW.deleted_at=0 BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created)
 SELECT 'comment:'||NEW.id,t.user_id,NEW.user_id,'comment',t.id,t.title,NEW.created
 FROM tracks t WHERE t.id=NEW.track_id AND t.user_id<>NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=t.user_id AND b.blocked_id=NEW.user_id) OR (b.blocked_id=t.user_id AND b.user_id=NEW.user_id));
END;
--> statement-breakpoint
CREATE TRIGGER activity_profile_follow AFTER INSERT ON follows WHEN NEW.kind='producer' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,created)
 SELECT 'follow:'||NEW.user_id||':'||p.id||':'||date(NEW.created,'unixepoch','+9 hours'),p.user_id,NEW.user_id,'follow',p.id,NEW.created
 FROM producers p WHERE p.id=NEW.target_id AND p.user_id<>NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=p.user_id AND b.blocked_id=NEW.user_id) OR (b.blocked_id=p.user_id AND b.user_id=NEW.user_id));
END;
