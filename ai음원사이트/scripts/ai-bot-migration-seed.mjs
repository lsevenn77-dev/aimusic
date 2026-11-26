// One-time generator for the NEW, unapplied migration only. Do not run after publishing.
import {appendFileSync} from 'node:fs';
import {BOT_DEFAULTS,BOT_SEED_TEMPLATES} from '../shared/ai-bots.js';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
let sql='\n--> statement-breakpoint\nINSERT INTO ai_bot_settings(id,json,updated) VALUES(1,'+quote(JSON.stringify(BOT_DEFAULTS))+',unixepoch());\n';
sql+='INSERT INTO ai_bot_templates(id,category,style,body,updated) VALUES\n'+BOT_SEED_TEMPLATES.map(t=>'('+[t.id,t.category,t.style,t.body].map(quote).join(',')+',unixepoch())').join(',\n')+';\n';
for(const [table,type,uid,eligible,category] of [
 ['tracks','track','user_id',"NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0)","CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END"],
 ['dubbing_projects','dubbing','owner_id',"NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0","'dubbing'"]
])for(const operation of ['INSERT','UPDATE']){
 const changed=operation==='UPDATE'?(table==='tracks'?" AND (OLD.status!='published' OR OLD.duet_open!=0)":" AND (OLD.state!='complete' OR OLD.visibility!='public')") :'';
 sql+=`--> statement-breakpoint
CREATE TRIGGER ai_enqueue_${type}_${operation.toLowerCase()} AFTER ${operation} ON ${table}
WHEN ${eligible}${changed} AND EXISTS(SELECT 1 FROM users WHERE id=NEW.${uid} AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:${type}:'||NEW.id||':'||action||':'||slot,'${type}',NEW.id,NEW.${uid},CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.${uid} AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.${uid} AND state='complete' AND visibility='public')<=1 THEN 'first:'||(${category}) ELSE (${category}) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=${category});
END;\n`;
}
// Prevent service identities from acquiring real economic or popularity activity,
// even if a future route accidentally bypasses the application-level guard.
for(const [table,col] of [['sessions','user_id'],['listens','user_id'],['likes','user_id'],['follows','user_id'],['gold_purchases','user_id'],['gifts','sender_id'],['free_gifts','sender_id'],['free_gift_wallets','user_id'],['gift_inventory','user_id'],['tracks','user_id'],['dubbing_projects','owner_id'],['crew_members','user_id'],['payout_accounts','user_id']]){
 sql+=`--> statement-breakpoint
CREATE TRIGGER ai_deny_${table} BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.${col} AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;\n`;
}
sql+=`--> statement-breakpoint
CREATE TRIGGER ai_identity_credentials BEFORE INSERT ON users WHEN NEW.account_type NOT IN ('human','ai_bot') OR (NEW.account_type='ai_bot' AND (NEW.password IS NOT NULL OR NEW.subject IS NOT NULL OR NEW.provider!='ai_service' OR NEW.id NOT GLOB 'ai_[0-9]*')) BEGIN SELECT RAISE(ABORT,'Invalid service identity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_identity_immutable BEFORE UPDATE OF account_type,password,provider,subject ON users WHEN NEW.account_type!=OLD.account_type OR (OLD.account_type='ai_bot' AND (NEW.password IS NOT NULL OR NEW.subject IS NOT NULL OR NEW.provider!='ai_service')) BEGIN SELECT RAISE(ABORT,'Service identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_xp BEFORE INSERT ON player_xp WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
CREATE TRIGGER ai_support_identity_guard BEFORE INSERT ON ai_support_gifts WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.sender_id AND account_type='ai_bot') OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') OR NEW.sender_id=NEW.owner_id BEGIN SELECT RAISE(ABORT,'Official support requires AI sender and human recipient'); END;
--> statement-breakpoint
CREATE TRIGGER ai_no_paid_recipient BEFORE INSERT ON gifts WHEN EXISTS(SELECT 1 FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id IN (NEW.creator_profile_id,NEW.singer_profile_id) AND u.account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot receive paid gifts'); END;
`;
appendFileSync('drizzle/0071_parched_talos.sql',sql);
