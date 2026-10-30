import {one,rows,query,now} from './db.js';
import {resolveNotification,allowed} from './notifications.js';
export function digestWindow(at){
 const shifted=new Date((at+9*3600)*1000),day=shifted.toISOString().slice(0,10);
 const cutoff=Date.parse(day+'T20:00:00+09:00')/1000;
 return at>=cutoff?{day,cutoff,start:cutoff-86400}:null;
}
async function digestItems(env,uid,w){
 const pref=await one(env,'SELECT artist_follower,artist_release FROM push_preferences WHERE user_id=?',uid)||{};
 const items=await rows(env,`SELECT n.*,(SELECT name FROM artists WHERE id=n.artist_id) artist_name FROM activity_notifications n WHERE n.recipient=? AND n.created>=? AND n.created<? AND n.kind IN ('artist_follower','artist_release') AND ${allowed} ORDER BY n.created,n.id`,uid,w.start,w.cutoff);
 const result=[];for(const n of items){if(pref[n.kind]===0)continue;if((await resolveNotification(env,n)).available)result.push(n);}return result;
}
export async function queueArtistDigests(env,at=now()){
 const w=digestWindow(at);if(!w)return;
 const candidates=await rows(env,`SELECT DISTINCT n.recipient FROM activity_notifications n JOIN users u ON u.id=n.recipient WHERE n.kind IN ('artist_follower','artist_release') AND n.created>=? AND n.created<? AND u.provider!='deleted' AND NOT EXISTS(SELECT 1 FROM notification_digests d WHERE d.recipient=n.recipient AND d.day=?) LIMIT 100`,w.start,w.cutoff,w.day);
 for(const {recipient} of candidates){
  if(!(await digestItems(env,recipient,w)).length)continue;
  // The ledger and its outbox insert commit together, including concurrent cron runs.
  await env.DB.batch([
   query(env,'INSERT OR IGNORE INTO notification_digests(recipient,day,cutoff,created) VALUES(?,?,?,?)',recipient,w.day,w.cutoff,at),
   query(env,`INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'artist-digest:'||recipient||':'||day,recipient,'artist_digest',day,created FROM notification_digests WHERE recipient=? AND day=?`,recipient,w.day)
  ]);
 }
}
export async function artistDigestBody(env,uid,day){
 const d=await one(env,'SELECT cutoff FROM notification_digests WHERE recipient=? AND day=?',uid,day);if(!d)return '';
 const items=await digestItems(env,uid,{start:d.cutoff-86400,cutoff:d.cutoff}),groups=new Map();
 for(const n of items){const key=n.artist_id||n.target,g=groups.get(key)||{name:n.artist_name||n.source_title,followers:0,releases:0};if(n.kind==='artist_follower')g.followers++;else g.releases++;groups.set(key,g);}
 return [...groups.values()].map(g=>g.name+' · '+[g.followers?'새 팔로워 '+g.followers+'명':'',g.releases?'신곡 '+g.releases+'곡':''].filter(Boolean).join(', ')).join(' / ').slice(0,220);
}
