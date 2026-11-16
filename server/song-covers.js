import {one,rows,fail,json} from './db.js';
import {trackList,published,VISIBLE,SINGABLE,COVER_SORTS} from './catalog.js';

// Opt-in song-page projection. Legacy cover consumers keep their existing contract.
export const completedCoverSQL=(t='t')=>`${t}.kind='cover' AND (${t}.cover_mode='solo' OR (${t}.cover_mode='duet' AND ${t}.duet_parent_id IS NOT NULL AND ${t}.duet_open=0))`;
const publication=(t='t')=>`COALESCE(NULLIF(${t}.first_published_at,0),${t}.created)`;
export async function songCovers(env,detail,params,user){
 const view=params.get('view');
 if(!['all','recent','duet','children'].includes(view))fail(400,'커버 목록을 확인해주세요.');
 const offset=Number(params.get('offset')||0),limit=50;
 if(!Number.isSafeInteger(offset)||offset<0)fail(400,'목록 위치를 확인해주세요.');
 const blocked=env.AIFECT_BLOCKED||[];
 const block=(t='t')=>blocked.length?` AND ${t}.user_id NOT IN (${blocked.map(()=>'?').join(',')})`:'';
 const base=`t.original_id=? AND ${VISIBLE()}`;
 const complete=`${base} AND ${completedCoverSQL()}`;
 const invite=`${base} AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_open=1 AND t.duet_parent_id IS NULL AND EXISTS(SELECT 1 FROM tracks d WHERE d.id=t.original_id AND ${VISIBLE('d')} AND ${SINGABLE('d')})${user?' AND t.user_id!=?':''}`;
 const inviteArgs=[detail.id,...(user?[user.id]:[])];
 const [done,open]=await Promise.all([
  one(env,`SELECT count(*) n FROM tracks t WHERE ${complete}${block()}`,detail.id,...blocked),
  one(env,`SELECT count(*) n FROM tracks t WHERE ${invite}${block()}`,...inviteArgs,...blocked)
 ]);
 const counts={all:done.n,recent:done.n,duet:open.n};
 let where=view==='duet'?invite:complete,args=view==='duet'?inviteArgs:[detail.id],total=view==='duet'?open.n:done.n;
 if(view==='children'){
  const parent=await published(env,params.get('parent')||'');
  if(parent.original_id!==detail.id||parent.kind!=='cover'||parent.cover_mode!=='duet'||parent.duet_parent_id!==null)fail(404,'듀엣 원본을 찾을 수 없어요.');
  where+=" AND t.cover_mode='duet' AND t.duet_parent_id=?";args.push(parent.id);
  total=(await one(env,`SELECT count(*) n FROM tracks t WHERE ${where}${block()}`,...args,...blocked)).n;
 }
 // Reuse the song page's existing ranking: qualified plays, likes, created, ID.
 const sort=view==='all'?COVER_SORTS.plays:`${publication()} DESC`;
 const covers=await trackList(env,where,args,sort+',t.id',`${limit} OFFSET ${offset}`);
 if(view==='duet'&&covers.length){
  const stats=await rows(env,`SELECT t.duet_parent_id parent_id,count(*) completions,
   count(DISTINCT CASE WHEN t.user_id!=p.user_id THEN t.user_id END) participants
   FROM tracks t JOIN tracks p ON p.id=t.duet_parent_id
   WHERE ${complete} AND t.cover_mode='duet' AND t.duet_parent_id IN (${covers.map(()=>'?').join(',')})${block()}
   GROUP BY t.duet_parent_id`,detail.id,...covers.map(t=>t.id),...blocked);
  for(const t of covers){const s=stats.find(s=>s.parent_id===t.id);Object.assign(t,{participants:s?.participants||0,completions:s?.completions||0,can_join:true});}
 }
 return json({view,covers:covers.map((t,i)=>view==='all'?{...t,rank:offset+i+1}:t),counts,total,
  next_offset:offset+covers.length<total?offset+covers.length:null,
  ranking_basis:view==='all'?'qualified_plays':null,
  accepts_covers:detail.kind==='original'&&detail.karaoke_at>0});
}
