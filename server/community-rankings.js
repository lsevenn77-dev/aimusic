import {dubbingPosterSQL} from './dubbing-poster.js';
import {rows,now,json,fail} from './db.js';
import {VISIBLE} from './catalog.js';
import {namedArtistSQL} from './artist-identity.js';
import {producerNameSQL} from './identity.js';
import {completedCoverSQL} from './song-covers.js';
import {trackArtworkSQL,artworkURL} from './track-artwork.js';
import {dubbingGenreArtwork} from '../shared/dubbing.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
export const RANK_WEIGHTS=Object.freeze({listeners:30,completion:20,reactions:15,gold:25,silver:10});
export const ARTIST_TOP_WEIGHTS=Object.freeze([1,.8,.6]);
export function communityPeriod(period='week',at=now()){
 if(!['week','month'].includes(period))fail(400,'주간 또는 월간을 선택해주세요.');
 const d=new Date((at+32400)*1000),y=d.getUTCFullYear(),m=d.getUTCMonth(),day=d.getUTCDate();
 const from=period==='week'?Date.UTC(y,m,day-(d.getUTCDay()+6)%7)/1000-32400:Date.UTC(y,m,1)/1000-32400;
 const until=period==='week'?from+604800:Date.UTC(y,m+1,1)/1000-32400;
 return {period,from,until,updated_at:at,time_zone:'Asia/Seoul'};
}
export function scoreWorks(items){
 const capped=items.map(r=>({...r,listeners:Math.max(0,Number(r.listeners)||0),completion:Math.max(0,Math.min(1,Number(r.completion)||0)),reactions:Math.max(0,Number(r.reactions)||0),gold:Math.max(0,Number(r.gold)||0),silver:Math.max(0,Number(r.silver)||0)}));
 const metric=(r,k)=>k==='gold'||k==='silver'?Math.log1p(r[k]):r[k];
 const max=Object.fromEntries(Object.keys(RANK_WEIGHTS).map(k=>[k,Math.max(0,...capped.map(r=>metric(r,k)))]));
 return capped.map(r=>({...r,score:Math.round(Object.entries(RANK_WEIGHTS).reduce((s,[k,w])=>s+(max[k]?w*metric(r,k)/max[k]:0),0)*100)/100})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function rankArtists(items){
 const groups=new Map();for(const r of items){if(r.kind!=='original'||!r.artist_id)continue;const g=groups.get(r.artist_id)||[];g.push(r);groups.set(r.artist_id,g);}
 return [...groups].map(([id,all])=>{const top=[...all].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,ARTIST_TOP_WEIGHTS.length);const score=top.reduce((s,r,i)=>s+r.score*ARTIST_TOP_WEIGHTS[i],0)/ARTIST_TOP_WEIGHTS.slice(0,top.length).reduce((a,b)=>a+b,0);return {id,name:all[0].artist_name,image_version:all[0].artist_image_version,image_url:all[0].artist_image_version?'/media/artist/'+encodeURIComponent(id)+'?v='+encodeURIComponent(all[0].artist_image_version):'/assets/default-avatar.svg',href:'#artist/'+id,score:Math.round(score*100)/100,detail:'공개 원곡 '+all[0].original_count+'곡 · 기간 상위 '+top.length+'곡',listeners:all.reduce((s,r)=>s+r.listeners,0),gold:all.reduce((s,r)=>s+r.gold,0),silver:all.reduce((s,r)=>s+r.silver,0)};}).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export async function communityRankingRoute(req,env,path){
 if(path!=='/api/community/rankings')return null;if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const p=new URL(req.url).searchParams,requested=p.get('category')||'aiArtist';
 const kind=p.get('workKind')||(requested==='cover'?'all':'solo');
 const category=requested==='work'?(kind==='dubbing'?'dubbing':'cover'):requested;
 if(!['cover','aiArtist','relationship','crew','dubbing'].includes(category)||
    !(category==='cover'?['all','solo','duet']:['solo','duet','dubbing']).includes(kind))fail(400,'랭킹 종류를 확인해주세요.');
 const period=communityPeriod(category==='cover'?(p.get('period')||'week'):'week');
 const integer=(name,fallback,max)=>{const value=p.get(name);if(value===null)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max||(name==='limit'&&Number(value)<1))fail(400,'랭킹 페이지 범위를 확인해주세요.');return Number(value);};
 const limit=integer('limit',100,100),offset=integer('offset',0,1000000);
 const page=(extra,all)=>json({...period,...extra,rows:all.slice(offset,offset+limit),total:all.length,limit,offset,next_offset:offset+limit<all.length?offset+limit:null});
 if(category==='relationship')return page({message:'관계별 XP와 양측 공개 동의 집계 연결을 준비하고 있어요.'},[]);
 if(category==='crew'){
  const data=await rows(env,`SELECT c.id,c.name,c.image_version,(SELECT count(*) FROM crew_members WHERE crew_id=c.id) members,COUNT(DISTINCT x.user_id) participants,COALESCE(sum(min(x.amount,100)),0) xp FROM crews c JOIN crew_xp x ON x.crew_id=c.id JOIN crew_members m ON m.crew_id=c.id AND m.user_id=x.user_id WHERE x.created>=? AND x.created<? AND x.id NOT LIKE 'gift:%' GROUP BY c.id`,period.from,period.until);
  return page({},data.filter(r=>r.members&&r.xp>0).map(r=>({...r,image_url:r.image_version?'/media/crew/'+encodeURIComponent(r.id)+'?v='+encodeURIComponent(r.image_version):'/assets/aifect-mark.svg',score:Math.round(r.xp*r.participants/r.members*100)/100,href:'#crew/'+r.id,detail:r.members+'명 · 활동 참여 '+r.participants+'명'})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)));
 }
 if(category==='dubbing'){
  // Dubbing has no paid-support/listening ledger. Do not fabricate those metrics.
  const data=await rows(env,`SELECT p.id,${dubbingPosterSQL} posterUrl,p.title name,p.options_json,(SELECT name FROM producers WHERE user_id=p.owner_id) creator,(SELECT count(DISTINCT user_id) FROM dubbing_recordings WHERE project_id=p.id AND script_key=p.script_key AND state='submitted') participants,(SELECT group_concat(name, ', ') FROM (SELECT DISTINCT pr.name FROM dubbing_recordings r JOIN producers pr ON pr.user_id=r.user_id WHERE r.project_id=p.id AND r.script_key=p.script_key AND r.state='submitted')) participant_names,COUNT(l.user_id) reactions FROM dubbing_projects p JOIN likes l ON l.dubbing_id=p.id AND l.user_id!=p.owner_id WHERE p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL('p')} AND EXISTS(SELECT 1 FROM dubbing_final_jobs f WHERE f.project_id=p.id AND f.script_key=p.script_key AND f.state='ready' AND f.output_key!='') AND l.created>=? AND l.created<? GROUP BY p.id`,period.from,period.until);
  return page({message:'이번 주 공개된 완성 더빙에 유효한 활동이 쌓이면 순위를 표시해요.'},scoreWorks(data).map(({options_json,...r})=>({...r,image_url:r.posterUrl||dubbingGenreArtwork(JSON.parse(options_json||'{}').genres),href:'#dubbing/'+r.id,detail:'더빙 · '+(r.creator||'제작자')+' · '+r.participants+'명 참여'+(r.participant_names?' ('+r.participant_names+')':'')+' · 유효 좋아요 집계'})));
 }
 const data=await workRankingData(env,period,category,kind);
 const scored=scoreWorks(data);return page({weights:RANK_WEIGHTS},category==='aiArtist'?rankArtists(scored):scored.map(r=>({...r,image_url:artworkURL(r),href:'#song/'+r.id,detail:r.cover_mode==='duet'?'듀엣':'솔로'})));
}

export async function workRankingData(env,period,category='work',kind='solo'){
 const artist=category==='aiArtist';
 const filter=artist?`t.kind='original' AND ${namedArtistSQL()}`:`t.original_id IS NOT NULL AND ${completedCoverSQL()}${kind==='all'?'':' AND t.cover_mode=?'}`;
 const coverFields=artist?'':`t.cover_mode,t.producer_id,${producerNameSQL()} producer,`;
 const data=await rows(env,`WITH window AS (SELECT ? start,? finish) SELECT t.id,t.title name,t.kind,${coverFields}${trackArtworkSQL()},t.artist_id,a.name artist_name,a.image_version artist_image_version,
 (SELECT count(*) FROM tracks o WHERE o.artist_id=t.artist_id AND o.kind='original' AND ${VISIBLE('o')}) original_count,
 (SELECT count(DISTINCT l.listener) FROM listens l,window w WHERE l.track_id=t.id AND l.qualified=1 AND (l.user_id IS NULL OR l.user_id!=t.user_id) AND l.started>=w.start AND l.started<w.finish) listeners,
 (SELECT COALESCE(avg(done),0) FROM (SELECT max(min(1,l.seconds/max(1,t.duration))) done FROM listens l,window w WHERE l.track_id=t.id AND l.qualified=1 AND (l.user_id IS NULL OR l.user_id!=t.user_id) AND l.started>=w.start AND l.started<w.finish GROUP BY l.listener)) completion,
 (SELECT count(*) FROM likes l,window w WHERE l.track_id=t.id AND l.user_id!=t.user_id AND l.created>=w.start AND l.created<w.finish)+(SELECT count(DISTINCT p.user_id) FROM playlist_tracks pt JOIN playlists p ON p.id=pt.playlist_id,window w WHERE pt.track_id=t.id AND p.user_id!=t.user_id AND pt.created>=w.start AND pt.created<w.finish) reactions,
 (SELECT COALESCE(sum(amount),0) FROM (SELECT min(sum(gl.gold),10000) amount FROM gifts g JOIN gift_lots gl ON gl.gift_id=g.id JOIN gold_purchases gp ON gp.id=gl.purchase_id,window w WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND gp.status='paid' AND gp.channel!='admin_test' AND NOT EXISTS(SELECT 1 FROM gold_orders go WHERE go.id=gp.id AND go.state!='paid') AND g.created>=w.start AND g.created<w.finish GROUP BY g.sender_id)) gold,
 (SELECT COALESCE(sum(amount),0) FROM (SELECT min(sum(g.silver),100) amount FROM free_gifts g,window w WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND g.created>=w.start AND g.created<w.finish GROUP BY g.sender_id)) silver
 FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id LEFT JOIN tracks o ON o.id=t.original_id WHERE ${VISIBLE()} AND ${filter}`,period.from,period.until,...(!artist&&kind!=='all'?[kind]:[]));
 return data;
}
