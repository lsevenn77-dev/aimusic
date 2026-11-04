-- Approved comment behavior: 2–3 distinct Luna personalities per new work.
-- Preserve disabled state, gifts, quotas, old comments and activity records.
--> statement-breakpoint
UPDATE ai_bot_settings SET json=json_set(json,'$.comments',3),revision=revision+1,updated=unixepoch() WHERE CAST(json_extract(json,'$.comments') AS INTEGER)>0;
--> statement-breakpoint
DROP TRIGGER ai_enqueue_track_insert;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_track_insert AFTER INSERT ON tracks
WHEN NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0) AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:track:'||NEW.id||':'||action||':'||slot,'track',NEW.id,NEW.user_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.user_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.user_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||(CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) ELSE (CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'comment',2 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<min(json_extract(s.json,'$.comments'),2+(unicode(substr(NEW.id,-1))%2))) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END);
END;
--> statement-breakpoint
DROP TRIGGER ai_enqueue_track_update;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_track_update AFTER UPDATE ON tracks
WHEN NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0) AND (OLD.status!='published' OR (OLD.duet_open!=0 AND NEW.cover_mode='duet')) AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:track:'||NEW.id||':'||action||':'||slot,'track',NEW.id,NEW.user_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.user_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.user_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||(CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) ELSE (CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'comment',2 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<min(json_extract(s.json,'$.comments'),2+(unicode(substr(NEW.id,-1))%2))) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END);
END;
--> statement-breakpoint
DROP TRIGGER ai_enqueue_dubbing_insert;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_dubbing_insert AFTER INSERT ON dubbing_projects
WHEN NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0 AND EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:dubbing:'||NEW.id||':'||action||':'||slot,'dubbing',NEW.id,NEW.owner_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.owner_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.owner_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||('dubbing') ELSE ('dubbing') END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'comment',2 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<min(json_extract(s.json,'$.comments'),2+(unicode(substr(NEW.id,-1))%2))) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value='dubbing');
END;
--> statement-breakpoint
DROP TRIGGER ai_enqueue_dubbing_update;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_dubbing_update AFTER UPDATE ON dubbing_projects
WHEN NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0 AND (OLD.state!='complete' OR OLD.visibility!='public') AND EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:dubbing:'||NEW.id||':'||action||':'||slot,'dubbing',NEW.id,NEW.owner_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.owner_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.owner_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||('dubbing') ELSE ('dubbing') END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'comment',2 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<min(json_extract(s.json,'$.comments'),2+(unicode(substr(NEW.id,-1))%2))) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value='dubbing');
END;
