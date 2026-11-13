import {dubbingPosterSQL} from './dubbing-poster.js';
import {dubbingPlayCountSQL} from './dubbing-plays.js';
import {rows} from './db.js';
import {VISIBLE,SINGABLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {publicNameSQL} from './identity.js';

// Same completed duet projection as #song; never count drafts or blocked works.
export async function profileCoverParticipation(env,covers,user){
 const ids=covers.filter(t=>t.cover_mode==='duet'&&!t.duet_parent_id&&(!t.status||t.status==='published')).map(t=>t.id);
 if(!ids.length)return;
 const blocked=env.AIFECT_BLOCKED||[];
 const stats=[];
 for(let start=0;start<ids.length;start+=80){const batch=ids.slice(start,start+80);stats.push(...await rows(env,`SELECT p.id,
  COUNT(t.id) completions,COUNT(DISTINCT CASE WHEN t.user_id!=p.user_id THEN t.user_id END) participants,
  (p.duet_open=1 AND p.duet_part IN ('male','female') AND p.original_key!='' AND EXISTS(SELECT 1 FROM tracks o WHERE o.id=p.original_id AND ${VISIBLE('o')} AND ${SINGABLE('o')})) joinable
  FROM tracks p LEFT JOIN tracks t ON t.duet_parent_id=p.id AND t.original_id=p.original_id
  AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_open=0 AND ${VISIBLE()}
  ${blocked.length?`AND t.user_id NOT IN (${blocked.map(()=>'?').join(',')})`:''}
  WHERE p.id IN (${batch.map(()=>'?').join(',')}) GROUP BY p.id`,...blocked,...batch));}
 for(const t of covers){const s=stats.find(s=>s.id===t.id);if(s)Object.assign(t,{recruiting:!!s.joinable,participants:s.participants,completions:s.completions,can_join:!!user&&user.id!==t.user_id&&!!s.joinable});}
}

// Reusable root relationship, moderation and block checks match dubbingVersions.
export const dubAudioReadySQL="EXISTS(SELECT 1 FROM dubbing_final_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready' AND j.output_key!='')";
export const finished=`p.state='complete' AND (EXISTS(SELECT 1 FROM dubbing_combinations c WHERE c.project_id=p.id AND c.expired_at=0) OR ${dubAudioReadySQL})`;
export async function completedDubbingWorks(env,root,user,offset=0){
 const uid=user?.id||'';
 return rows(env,`SELECT p.id,${dubbingPosterSQL} posterUrl,p.title,'dubbing' kind,p.owner_id,p.duration,p.state,p.visibility,p.created,p.options_json,${dubbingPlayCountSQL()} plays,${dubAudioReadySQL} audio_ready,COUNT(*) OVER() total,
  ${publicNameSQL('u')} owner_name,
  (SELECT COUNT(*) FROM dubbing_role_claims c WHERE c.project_id=p.id) participants,
  (SELECT group_concat(CASE WHEN EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=cu.id) OR (b.blocked_id=? AND b.user_id=cu.id)) THEN '참여자' ELSE ${publicNameSQL('cu')} END, ' & ') FROM dubbing_role_claims c JOIN users cu ON cu.id=c.user_id WHERE c.project_id=p.id AND cu.provider!='deleted') performers
  FROM dubbing_projects p JOIN users u ON u.id=p.owner_id
  WHERE p.root_id=? AND p.visibility='public' AND ${finished} AND u.provider!='deleted' AND ${dubbingVisibleSQL()}
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))
  ORDER BY p.created DESC,p.id LIMIT 51 OFFSET ?`,uid,uid,root,uid,uid,offset);
}

export async function profileDubbingParticipation(env,projects,user){
 const uid=user?.id||'',ids=projects.filter(p=>!p.root_id).map(p=>p.id);
 if(!ids.length)return;
 const stats=[];
 for(let start=0;start<ids.length;start+=80){const batch=ids.slice(start,start+80);stats.push(...await rows(env,`SELECT p.root_id,COUNT(DISTINCT p.id) completions,COUNT(DISTINCT CASE WHEN c.user_id!=root.owner_id THEN c.user_id END) participants
  FROM dubbing_projects p JOIN dubbing_projects root ON root.id=p.root_id JOIN users u ON u.id=p.owner_id
  LEFT JOIN dubbing_role_claims c ON c.project_id=p.id
  WHERE p.root_id IN (${batch.map(()=>'?').join(',')}) AND p.visibility='public' AND ${finished} AND u.provider!='deleted' AND ${dubbingVisibleSQL()}
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id)) GROUP BY p.root_id`,...batch,uid,uid));}
 for(const p of projects){const s=stats.find(s=>s.root_id===p.id);p.completions=s?.completions||0;p.completed_participants=s?.participants||0;}
}
export const dubRecruitingSQL=()=>`p.visibility='public' AND p.state IN ('recruiting','recording')
 AND (SELECT count(*) FROM dubbing_role_claims rc WHERE rc.project_id=p.id)<p.role_count
 AND EXISTS(SELECT 1 FROM dubbing_recordings r JOIN dubbing_recording_lines l ON l.recording_id=r.id WHERE r.project_id=p.id AND r.script_key=p.script_key)
 AND EXISTS(SELECT 1 FROM dubbing_sound_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready' AND j.output_key!='')`;
