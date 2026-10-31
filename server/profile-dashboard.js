import {one,rows} from './db.js';
import {publicNameSQL} from './identity.js';
import {VISIBLE} from './catalog.js';
import {namedArtistSQL} from './artist-identity.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {relationList} from './relations.js';
import {dubAudioReadySQL,dubRecruitingSQL,profileDubbingParticipation} from './profile-works.js';

export const publicNumberSQL=uid=>`(SELECT number FROM public_member_ids WHERE user_id=${uid})`;
// No private balances, XP, inventory or notification records in this public DTO.
export async function profileDashboard(env,profile,user){
 const own=user?.id===profile.user_id,uid=profile.user_id;
 const [identity,crew,artists,dubbings,relations]=await Promise.all([
  one(env,`SELECT ${publicNumberSQL('u.id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id,(SELECT count(*) FROM follows WHERE user_id=u.id) following_count,
   (SELECT count(*) FROM follows WHERE user_id=u.id AND kind='producer') profile_following_count,
   (SELECT count(*) FROM tracks t WHERE t.user_id=u.id AND t.kind='original' AND ${own?"t.status!='deleted'":VISIBLE()}) produced_track_count,
   (SELECT count(*) FROM tracks t LEFT JOIN tracks dt ON dt.id=t.duet_parent_id WHERE (t.user_id=u.id OR dt.user_id=u.id) AND ${VISIBLE()}) public_track_count FROM users u WHERE u.id=?`,uid),
  one(env,'SELECT c.id,c.name,c.description,c.image_version,(SELECT count(*) FROM crew_members WHERE crew_id=c.id) members FROM crews c JOIN crew_members cm ON cm.crew_id=c.id WHERE cm.user_id=?',uid),
  rows(env,`SELECT a.id,a.name,a.image_version,(SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id AND EXISTS(SELECT 1 FROM users fan WHERE fan.id=f.user_id AND fan.provider!='deleted') AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=f.user_id AND b.blocked_id IN (?,?)) OR (b.blocked_id=f.user_id AND b.user_id IN (?,?))) AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks ab WHERE ab.artist_id=a.id AND ab.user_id=f.user_id)) followers FROM artists a WHERE a.producer_id=? AND ${namedArtistSQL()} ORDER BY a.created DESC,a.id`,user?.id||'',uid,user?.id||'',uid,profile.id),
  env.DUBBING_ENABLED==='true'?rows(env,`SELECT p.id,p.owner_id,p.title,p.duration,p.state,p.visibility,p.created,p.role_count,p.root_id,p.options_json,${dubAudioReadySQL} audio_ready,(${dubRecruitingSQL()}) recruiting,${publicNameSQL('u')} owner_name,
   (p.visibility='public' AND EXISTS(SELECT 1 FROM dubbing_projects source JOIN dubbing_sound_jobs j ON j.project_id=source.id AND j.script_key=source.script_key WHERE source.id=COALESCE(p.root_id,p.id) AND source.visibility='public' AND ${dubbingVisibleSQL('source')} AND j.state='ready' AND j.output_key!='')) can_join,
   (SELECT count(*) FROM dubbing_role_claims c WHERE c.project_id=p.id) participants
   FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE u.provider!='deleted' AND p.deleted_at=0
   AND (p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?))
   AND ${dubbingVisibleSQL()} AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM dubbing_projects root WHERE root.id=p.root_id AND root.deleted_at=0 AND ${dubbingVisibleSQL('root')}))
   AND ${own?"(p.owner_id=? OR p.visibility='public')":"p.visibility='public' AND p.state='complete'"}
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))
   ORDER BY p.created DESC,p.id`,uid,uid,...(own?[uid]:[]),user?.id||'',user?.id||''):[],
  own?[]:relationList(env,uid,user?.id||'')
 ]);
 await profileDubbingParticipation(env,dubbings,user);
 for(const p of dubbings)p.can_join=!!user&&!!p.can_join;
 const pin=await one(env,'SELECT ids_json FROM profile_artist_pins WHERE producer_id=?',profile.id),pinned=JSON.parse(pin?.ids_json||'[]');artists.sort((a,b)=>(pinned.includes(a.id)?pinned.indexOf(a.id):99)-(pinned.includes(b.id)?pinned.indexOf(b.id):99));
 return {...identity,profile_work_count:(identity.public_track_count||0)+dubbings.filter(p=>p.state==='complete'&&p.visibility==='public').length,crew,artists,pinned,relations,dubbings:dubbings.map(({options_json,...p})=>({...p,kind:'dubbing',genres:JSON.parse(options_json).genres||[]}))};
}

// Called only after requireUser, always scoped to the authenticated UUID.
export async function profileActivity(env,user){
 const uid=user.id;
 const recent=await rows(env,`SELECT * FROM (
  SELECT 'like' kind,l.created,t.title,t.id target,'song' route FROM likes l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=? AND t.status='published'
  UNION ALL SELECT 'comment',c.created,t.title,t.id,'song' FROM comments c JOIN tracks t ON t.id=c.track_id WHERE c.user_id=? AND c.deleted_at=0 AND t.status='published'
  UNION ALL SELECT 'gift',g.created,g.gift_name,COALESCE(g.track_id,g.creator_profile_id),CASE WHEN g.track_id IS NULL THEN 'producer' ELSE 'song' END FROM gifts g WHERE g.sender_id=?
  UNION ALL SELECT 'gift',g.created,g.gift_name,COALESCE(g.track_id,g.recipient_profile_id),CASE WHEN g.track_id IS NULL THEN 'producer' ELSE 'song' END FROM free_gifts g WHERE g.sender_id=?
 ) ORDER BY created DESC LIMIT 20`,uid,uid,uid,uid);
 const received=await rows(env,`SELECT g.*,${publicNameSQL('u')} sender_name,p.id sender_profile_id,p.image_version FROM (
  SELECT g.id,g.sender_id,g.gift_type,g.gift_name,g.quantity,g.created FROM gifts g JOIN producers recipient ON (recipient.id=g.singer_profile_id OR recipient.id=g.creator_profile_id) WHERE recipient.user_id=?
  UNION ALL SELECT g.id,g.sender_id,g.gift_type,g.gift_name,g.quantity,g.created FROM free_gifts g LEFT JOIN tracks t ON t.id=g.track_id JOIN producers recipient ON recipient.id=COALESCE(g.recipient_profile_id,t.producer_id) WHERE recipient.user_id=?
 ) g JOIN users u ON u.id=g.sender_id LEFT JOIN producers p ON p.user_id=u.id
 WHERE NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.user_id=u.id)) ORDER BY g.created DESC,g.id DESC LIMIT 50`,uid,uid,uid,uid);
 return {recent,received};
}
