-- Metadata correction must not count as a new publication or enqueue bot activity.
DROP TRIGGER ai_enqueue_track_update;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_track_update AFTER UPDATE ON tracks
WHEN NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0) AND (OLD.status!='published' OR (OLD.duet_open!=0 AND NEW.cover_mode='duet')) AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:track:'||NEW.id||':'||action||':'||slot,'track',NEW.id,NEW.user_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.user_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.user_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||(CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) ELSE (CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END);
END;
--> statement-breakpoint
-- These two published recordings were explicitly identified by the operator as solo covers.
-- Audit and classification update are one atomic statement. Audio and financial data are untouched.
CREATE TRIGGER repair_0076_solo_audit BEFORE UPDATE OF cover_mode ON tracks
WHEN OLD.cover_mode='duet' AND NEW.cover_mode='solo'
 AND OLD.id IN ('e8ce3d21-43f4-4eee-bf8c-e6187b417d7d','40d9c296-8098-4f3a-a4d5-344a3621d60f')
BEGIN
 INSERT INTO admin_audit(id,admin_id,action,target,created)
 VALUES('repair-0076:'||OLD.id,'operator-approved-migration:0076','cover_mode_correction',
  json_object('track_id',OLD.id,'title',OLD.title,'user_id',OLD.user_id,'original_id',OLD.original_id,
   'before',json_object('cover_mode',OLD.cover_mode,'duet_open',OLD.duet_open,'duet_part',OLD.duet_part,'duet_guide',OLD.duet_guide),
   'after',json_object('cover_mode',NEW.cover_mode,'duet_open',NEW.duet_open,'duet_part',NEW.duet_part,'duet_guide',NEW.duet_guide)),unixepoch());
END;
--> statement-breakpoint
UPDATE tracks SET cover_mode='solo',duet_open=0,duet_part='',duet_guide=''
WHERE user_id='8ee92b09-75cb-41f2-b14d-0212a893bed1'
 AND producer_id='ff6a2f36-5277-4a99-b00d-9586543580d0'
 AND ((id='e8ce3d21-43f4-4eee-bf8c-e6187b417d7d' AND original_id='d4c239cc-d765-4ca3-a62e-97283a7c9e8b')
   OR (id='40d9c296-8098-4f3a-a4d5-344a3621d60f' AND original_id='2b4a4bce-a7e9-4f80-b688-d49b551c0cef'))
 AND kind='cover' AND status='published' AND cover_mode='duet' AND duet_open=1
 AND duet_parent_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM tracks child WHERE child.duet_parent_id=tracks.id);
--> statement-breakpoint
DROP TRIGGER repair_0076_solo_audit;
