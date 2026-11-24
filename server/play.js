// @ts-check
// Read-only discovery. Recording, publishing, claims and mixing keep their existing routes.
import {dubbingPosterSQL} from './dubbing-poster.js';
import {rows,json,fail} from './db.js';
import {requireUser} from './auth.js';
import {trackList,VISIBLE,SINGABLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {publicNameSQL,producerLookupNameSQL} from './identity.js';

const unblocked=`NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))`;
const finished=`p.state='complete' AND (EXISTS(SELECT 1 FROM dubbing_combinations c WHERE c.project_id=p.id AND c.expired_at=0) OR EXISTS(SELECT 1 FROM dubbing_final_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready' AND j.output_key!=''))`;
const publishedAt=`COALESCE((SELECT MAX(j.updated) FROM dubbing_final_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready'),p.updated)`;
const likes=`(SELECT COUNT(*) FROM likes l WHERE l.dubbing_id=p.id)`;
const count=`(SELECT COUNT(*) FROM dubbing_role_claims c WHERE c.project_id=p.id)`;

async function dubbings(env,user,{tab='latest',type='all',offset=0,limit=25,q=''}={}){
 if(env.DUBBING_ENABLED!=='true'||!['all','dubbing'].includes(type))return [];
 const uid=user?.id||'',args=[uid,uid];
 let where=`p.visibility='public' AND ${finished}`;
 if(tab==='following'){
  where+=` AND EXISTS(SELECT 1 FROM follows f JOIN producers fp ON fp.id=f.target_id WHERE f.user_id=? AND f.kind='producer' AND fp.user_id=p.owner_id)`;
  args.push(uid);
 }
 if(tab==='join'){
  where=`p.visibility='public' AND p.state IN ('recruiting','recording') AND ${count}<p.role_count
   AND NOT EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?)
   AND EXISTS(SELECT 1 FROM dubbing_sound_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready' AND j.output_key!='')`;
  args.push(uid);
 }
 if(q){where+=' AND (p.title LIKE ? OR '+publicNameSQL('u')+' LIKE ?)';args.push('%'+q+'%','%'+q+'%');}
 const sort=tab==='popular'?`${likes} DESC,${publishedAt} DESC`:tab==='join'?'p.created DESC':`${publishedAt} DESC`;
 return rows(env,`SELECT p.id,${dubbingPosterSQL} posterUrl,p.owner_id ownerId,p.title,'dubbing' type,p.state,p.visibility,p.duration,p.created,${publishedAt} publishedAt,
  ${publicNameSQL('u')} ownerName,p.options_json,p.role_count roleCount,${count} participants,${likes} likes,
  (SELECT id FROM producers WHERE user_id=p.owner_id LIMIT 1) producer_id
  FROM dubbing_projects p JOIN users u ON u.id=p.owner_id
  WHERE u.provider!='deleted' AND ${dubbingVisibleSQL()} AND ${unblocked} AND ${where}
  ORDER BY ${sort},p.id LIMIT ? OFFSET ?`,...args,limit,offset);
}

export async function playRoute(req,env,path,user){
 if(!['/api/play/works','/api/play/participate','/api/play/latest','/api/play/songs'].includes(path))return null;
 if(req.method!=='GET')fail(405,'목록 조회만 지원합니다.');
 const params=new URL(req.url).searchParams;
 const offset=Math.max(0,Math.min(10000,Math.floor(Number(params.get('offset'))||0)));
 const q=(params.get('q')||'').trim().slice(0,100);
 if(path==='/api/play/songs'){
  const tab=params.get('tab')||'recommended',args=[];
  if(!['recommended','latest','duets'].includes(tab))fail(400,'목록 종류를 확인해 주세요.');
  const duet=tab==='duets';
  let where=duet?`${VISIBLE()} AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_open=1 AND t.duet_parent_id IS NULL AND EXISTS(SELECT 1 FROM tracks d WHERE d.id=t.original_id AND ${VISIBLE('d')} AND ${SINGABLE('d')})`:`${VISIBLE()} AND ${SINGABLE()}`;
  if(duet&&user){where+=' AND t.user_id!=?';args.push(user.id);}
  // Use the catalog's public display names, including the inherited AI artist on duets.
  if(q){where+=' AND (t.title LIKE ? OR a.name LIKE ? OR ('+producerLookupNameSQL()+') LIKE ?)';args.push(...Array(3).fill('%'+q+'%'));}
  const tracks=await trackList(env,where,args,tab==='recommended'?'(plays+likes*3) DESC,t.created DESC,t.id':'t.created DESC,t.id',offset+26);
  const page=tracks.slice(offset,offset+25),ids=[...new Set(page.map(t=>t.id))],blocked=env.AIFECT_BLOCKED||[];
  const block=blocked.length?' AND cv.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':'';
  // Recruitment counts must belong to this exact half, not every cover of its original.
  const counts=ids.length?await rows(env,duet?`SELECT cv.duet_parent_id parent_id,COUNT(*) completions,
   COUNT(DISTINCT CASE WHEN cv.user_id!=parent.user_id THEN cv.user_id END) participants
   FROM tracks cv JOIN tracks parent ON parent.id=cv.duet_parent_id
   WHERE cv.kind='cover' AND cv.cover_mode='duet' AND cv.duet_open=0 AND cv.original_id=parent.original_id AND ${VISIBLE('cv')}
   AND cv.duet_parent_id IN (${ids.map(()=>'?').join(',')})${block} GROUP BY cv.duet_parent_id`:
   `SELECT cv.original_id,COUNT(DISTINCT cv.user_id) participants FROM tracks cv WHERE cv.kind='cover' AND ${VISIBLE('cv')} AND cv.original_id IN (${ids.map(()=>'?').join(',')})${block} GROUP BY cv.original_id`,...ids,...blocked):[];
  return json({tracks:page.map(t=>{const c=counts.find(c=>duet?c.parent_id===t.id:c.original_id===t.id);return {...t,participants:c?.participants||0,...(duet?{completions:c?.completions||0,can_join:true}:{} )};}),nextOffset:tracks.length>offset+25?offset+25:null});
 }
 if(path==='/api/play/latest')return json({tracks:await trackList(env,`${VISIBLE()} AND ${SINGABLE()}`,[],'t.created DESC,t.id',100)});
 if(path==='/api/play/participate'){
  if(env.DUBBING_ENABLED!=='true')fail(503,'더빙 스튜디오를 준비하고 있습니다.');
  const projects=await dubbings(env,user,{tab:'join',offset,q});
  return json({projects:projects.map(p=>({...p,genres:JSON.parse(p.options_json).genres,options_json:undefined})),nextOffset:projects.length===25?offset+25:null});
 }
 const tab=params.get('tab')||'recommended',type=params.get('type')||'all';
 if(!['recommended','following','popular','latest'].includes(tab)||!['all','solo','duet','dubbing'].includes(type))fail(400,'목록 종류를 확인해 주세요.');
 if(tab==='following')requireUser(user);
 let where=`${VISIBLE()} AND t.kind='cover' AND (t.cover_mode='solo' OR (t.cover_mode='duet' AND t.duet_parent_id IS NOT NULL AND t.duet_open=0))`,args=[];
 if(['solo','duet'].includes(type)){where+=' AND t.cover_mode=?';args.push(type);}
 if(tab==='following'){where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.kind='producer' AND f.target_id=t.producer_id)";args.push(user.id);}
 if(q){where+=' AND (t.title LIKE ? OR p.name LIKE ?)';args.push('%'+q+'%','%'+q+'%');}
 // Existing cover popularity: likes, plays, creation time. Existing recommendation: recent public covers.
 // Tracks have no separate publication timestamp; keep the catalog's created fallback.
 const sort=tab==='popular'?'likes DESC,plays DESC,t.created DESC,t.id':'t.created DESC,t.id';
 const [tracks,projects]=await Promise.all([
  type==='dubbing'?[]:trackList(env,where,args,sort,offset+26),
  dubbings(env,user,{tab,type,limit:offset+26,q})
 ]);
 const works=[...tracks.map(t=>({...t,type:t.cover_mode,publishedAt:t.created})),...projects.map(p=>({...p,genres:JSON.parse(p.options_json).genres,options_json:undefined}))];
 works.sort((a,b)=>(tab==='popular'?b.likes-a.likes||Number(b.plays||0)-Number(a.plays||0):0)||b.publishedAt-a.publishedAt||a.id.localeCompare(b.id));
 return json({works:works.slice(offset,offset+25),nextOffset:works.length>offset+25?offset+25:null,dubbingAvailable:env.DUBBING_ENABLED==='true'});
}
