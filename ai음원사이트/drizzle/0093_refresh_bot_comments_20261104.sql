-- Explicit owner request, 2026-11-04: replace existing bot comments and write
-- 2-3 personality/genre-based comments on existing published songs/covers.
-- Keep the originals visible until the first successful Luna result commits.
INSERT OR IGNORE INTO ai_bot_audit(id,actor,action,details,created)
SELECT 'comment-refresh:20261104:backup:'||c.id,'owner-request:20261104','comment_refresh_backup',
 json_object('id',c.id,'track_id',c.track_id,'dubbing_id',c.dubbing_id,'user_id',c.user_id,'parent_id',c.parent_id,'body',c.body,'created',c.created),unixepoch()
FROM comments c JOIN ai_bots b ON b.user_id=c.user_id JOIN users u ON u.id=c.user_id
WHERE c.deleted_at=0 AND u.account_type='ai_bot' AND u.provider='ai_service';
--> statement-breakpoint
INSERT OR IGNORE INTO ai_bot_audit(id,actor,action,details,created)
VALUES('comment-refresh:20261104','owner-request:20261104','comment_refresh_requested',
 '{"scope":"existing published original songs and completed covers","comments_per_work":"2-3","preserve":"human comments, replies, gifts, follows and historical activities","replace_after_first_success":true}',unixepoch());
--> statement-breakpoint
-- Invalidate any in-flight job before retiring its queue slot. Historical job IDs,
-- activities and follow references stay intact; no gifts are queued or changed.
UPDATE ai_bot_settings SET revision=revision+1,lease_token='',lease_until=0,updated=unixepoch() WHERE id=1;
--> statement-breakpoint
UPDATE ai_bot_jobs SET action='comment_before_20261104',
 state=CASE WHEN state='done' THEN state ELSE 'skipped' END,
 error=CASE WHEN state='done' THEN error ELSE 'Superseded by owner-requested comment refresh 20261104' END,updated=unixepoch()
WHERE action='comment' AND id NOT LIKE 'refresh:20261104:%';
--> statement-breakpoint
INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
SELECT 'refresh:20261104:track:'||t.id||':'||options.slot,'track',t.id,t.user_id,
 CASE WHEN t.kind='original' THEN 'original' ELSE t.cover_mode END,'comment',options.slot,unixepoch(),'refresh_waiting',unixepoch(),unixepoch()
FROM tracks t JOIN users u ON u.id=t.user_id CROSS JOIN (SELECT 0 slot UNION ALL SELECT 1 UNION ALL SELECT 2) options
WHERE t.status='published' AND (t.kind='original' OR t.duet_open=0) AND u.account_type='human' AND u.provider!='deleted'
 AND options.slot<2+(unicode(substr(t.id,-1))%2)
 AND NOT EXISTS(SELECT 1 FROM track_reports r WHERE r.track_id=t.id AND r.status IN ('removed','appealed','upheld'));
