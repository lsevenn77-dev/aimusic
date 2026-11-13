import {dubbingPosterSQL} from './dubbing-poster.js';
import {one,rows,query,now} from './db.js';
import {publicNameSQL} from './identity.js';
import {VISIBLE} from './catalog.js';
import {namedArtistSQL} from './artist-identity.js';
import {dubbingVisibleSQL,assertDubbingCreator} from './dubbing-access.js';
import {relationList} from './relations.js';
import {CASTING_LICENSE,CASTING_TTL} from './dubbing-casting.js';
import {dubAudioReadySQL,dubRecruitingSQL,finished,profileDubbingParticipation} from './profile-works.js';

export const publicNumberSQL=uid=>`(SELECT number FROM public_member_ids WHERE user_id=${uid})`;
// No private balances, XP, inventory or notification records in this public DTO.
export async function profileDashboard(env,profile,user,profileWorks=false){
 const own=user?.id===profile.user_id,uid=profile.user_id;
 // Casting accepts a new take only from a licensed public base with ready background audio.
 const rootReady=`EXISTS(SELECT 1 FROM dubbing_projects root JOIN dubbing_recordings r ON r.project_id=root.id
  JOIN dubbing_recording_permissions perm ON perm.recording_id=r.id JOIN dubbing_sound_jobs j ON j.project_id=root.id AND j.script_key=root.script_key
  WHERE root.id=COALESCE(p.root_id,p.id) AND root.visibility='public' AND root.role_count>1 AND r.user_id=root.owner_id
  AND r.state='submitted' AND perm.visibility='public' AND perm.license_version='${CASTING_LICENSE}' AND j.state='ready' AND j.output_key!='')`;
 const openCasting=`p.visibility='public' AND ${rootReady} AND (p.root_id IS NULL OR EXISTS(
  SELECT 1 FROM dubbing_combinations c WHERE c.project_id=p.id AND c.expired_at=0 AND c.last_participation>${now()-CASTING_TTL}
  AND p.state IN ('recruiting','recording') AND (SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=p.id AND r.state='submitted')<p.role_count))`;
 const openWork=`((${openCasting}) OR (p.root_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dubbing_combinations c WHERE c.project_id=p.id) AND (${dubRecruitingSQL()})))`;
 const workProjection=profileWorks?`
   (${finished}) work_finished,(${openWork}) work_open,
   EXISTS(SELECT 1 FROM dubbing_combinations c WHERE c.project_id=p.id) casting_combo,
   (EXISTS(SELECT 1 FROM dubbing_role_claims vc WHERE vc.project_id=p.id AND vc.user_id=?1)
    OR EXISTS(SELECT 1 FROM dubbing_recordings vr WHERE vr.project_id=p.id AND vr.user_id=?1)
    OR EXISTS(SELECT 1 FROM dubbing_projects root WHERE root.id=p.root_id AND root.owner_id=?1)) viewer_claimed,`:'';
 const workBlocks=profileWorks?`AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
   (b.user_id=?1 AND b.blocked_id IN (SELECT user_id FROM dubbing_recordings WHERE project_id=p.id UNION SELECT owner_id FROM dubbing_projects WHERE id=p.root_id))
   OR (b.blocked_id=?1 AND b.user_id IN (SELECT user_id FROM dubbing_recordings WHERE project_id=p.id UNION SELECT owner_id FROM dubbing_projects WHERE id=p.root_id)))`:'';
 const [[identityResult,crewResult,artistsResult,dubbingsResult,pinResult],relations]=await Promise.all([env.DB.batch([
  query(env,`SELECT ${publicNumberSQL('u.id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id,(SELECT count(*) FROM follows WHERE user_id=u.id) following_count,
   (SELECT count(*) FROM follows WHERE user_id=u.id AND kind='producer') profile_following_count,
   (SELECT count(*) FROM tracks t WHERE t.user_id=u.id AND t.kind='original' AND ${own?"t.status!='deleted'":VISIBLE()}) produced_track_count,
   (SELECT count(*) FROM tracks t LEFT JOIN tracks dt ON dt.id=t.duet_parent_id WHERE (t.user_id=u.id OR dt.user_id=u.id) AND ${VISIBLE()}) public_track_count FROM users u WHERE u.id=?`,uid),
  query(env,'SELECT c.id,c.name,c.description,c.image_version,(SELECT count(*) FROM crew_members WHERE crew_id=c.id) members FROM crews c JOIN crew_members cm ON cm.crew_id=c.id WHERE cm.user_id=?',uid),
  query(env,`SELECT a.id,a.name,a.image_version,(SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id AND EXISTS(SELECT 1 FROM users fan WHERE fan.id=f.user_id AND fan.provider!='deleted') AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=f.user_id AND b.blocked_id IN (?,?)) OR (b.blocked_id=f.user_id AND b.user_id IN (?,?))) AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks ab WHERE ab.artist_id=a.id AND ab.user_id=f.user_id)) followers FROM artists a WHERE a.producer_id=? AND ${namedArtistSQL()} ORDER BY a.created DESC,a.id`,user?.id||'',uid,user?.id||'',uid,profile.id),
  env.DUBBING_ENABLED==='true'?query(env,`SELECT p.id,${dubbingPosterSQL} posterUrl,p.owner_id,p.title,p.duration,p.state,p.visibility,p.created,p.role_count,p.root_id,p.options_json,${workProjection}${dubAudioReadySQL} audio_ready,(${dubRecruitingSQL()}) recruiting,${publicNameSQL('u')} owner_name,
   (p.visibility='public' AND EXISTS(SELECT 1 FROM dubbing_projects source JOIN dubbing_sound_jobs j ON j.project_id=source.id AND j.script_key=source.script_key WHERE source.id=COALESCE(p.root_id,p.id) AND source.visibility='public' AND ${dubbingVisibleSQL('source')} AND j.state='ready' AND j.output_key!='')) can_join,
   (SELECT count(*) FROM dubbing_role_claims c WHERE c.project_id=p.id) participants
   FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE u.provider!='deleted' AND p.deleted_at=0
   AND (p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?) ${profileWorks?'OR EXISTS(SELECT 1 FROM dubbing_recordings r WHERE r.project_id=p.id AND r.user_id=? AND r.state=\'submitted\')':''})
   AND ${dubbingVisibleSQL()} AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM dubbing_projects root WHERE root.id=p.root_id AND root.deleted_at=0 AND ${dubbingVisibleSQL('root')}))
   AND ${own?"(p.owner_id=? OR p.visibility='public')":profileWorks?`p.visibility='public' AND ((${finished}) OR ${openWork})`:"p.visibility='public' AND p.state='complete'"}
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))
   ${workBlocks}
   ORDER BY p.created DESC,p.id`,...(profileWorks?[user?.id||'']:[]),uid,uid,...(profileWorks?[uid]:[]),...(own?[uid]:[]),user?.id||'',user?.id||''):query(env,'SELECT 1 WHERE 0'),
  query(env,'SELECT ids_json FROM profile_artist_pins WHERE producer_id=?',profile.id)
 ]),
  own?[]:relationList(env,uid,user?.id||'')
 ]);
 const identity=identityResult.results[0],crew=crewResult.results[0]||null,artists=artistsResult.results,dubbings=dubbingsResult.results;
 await profileDubbingParticipation(env,dubbings,user);
 let canParticipate=!!user;
 if(profileWorks&&user&&dubbings.length){
  try{await assertDubbingCreator(env,user.id);}catch(error){if(error.status!==403)throw error;canParticipate=false;}
 }
 for(const p of dubbings)p.can_join=!!user&&!!p.can_join&&(!profileWorks||(canParticipate&&!!p.work_open&&p.owner_id!==user.id&&!p.viewer_claimed));
 const pin=pinResult.results[0],pinned=JSON.parse(pin?.ids_json||'[]');artists.sort((a,b)=>(pinned.includes(a.id)?pinned.indexOf(a.id):99)-(pinned.includes(b.id)?pinned.indexOf(b.id):99));
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
