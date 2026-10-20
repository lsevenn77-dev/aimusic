import {one,rows,run,json,fail,now} from './db.js';
import {VISIBLE,trackList,published} from './catalog.js';
import {mediaRoute} from './media.js';
export const VOICE_MUSIC_TERMS='2026-10-20-room-listening';
export const VOICE_MUSIC_CONSENT='이 원곡을 AIFECT 토킹룸에서 참가자가 함께 듣도록 허용할 권리를 보유하며 공동 감상에 동의합니다. 공동 감상은 일반 스트리밍 조회수·정산에 중복 반영되지 않습니다.';
const permissionSQL="EXISTS(SELECT 1 FROM voice_music_permissions vp WHERE vp.track_id=t.id AND vp.owner_id=t.user_id AND vp.terms='"+VOICE_MUSIC_TERMS+"')";
export async function roomTrack(env,id){
 const t=await published(env,id);
 if(t.kind!=='original'||!t.rights_accepted||!await one(env,'SELECT track_id FROM voice_music_permissions WHERE track_id=? AND owner_id=? AND terms=?',t.id,t.user_id,VOICE_MUSIC_TERMS))fail(403,'권리자가 토킹룸 공동 감상을 허용한 원곡만 선택할 수 있어요.');
 const detail=(await trackList(env,'t.id=?',[t.id]))[0];
 if(!detail||!Number.isFinite(detail.duration)||detail.duration<=0)fail(409,'재생 가능한 음원을 준비하고 있어요.');
 return {id:detail.id,title:detail.title,artist:detail.artist||detail.producer,duration:detail.duration,cover:detail.has_cover?'/media/'+detail.id+'/cover?v='+encodeURIComponent(detail.cover_version||''):'/assets/voice-music-cover.svg'};
}
export async function voiceMusicRoute(req,env,user,room,action,b,call){
 if(!['music-search','music-consent','music','music-stream'].includes(action))return null;
 const url=new URL(req.url),generation=b?.generation||url.searchParams.get('generation');
 const state=await call('state',{generation});
 const host=state.members.find(m=>m.id===state.self)?.role==='host';
 if(action!=='music-stream'&&!host)fail(403,'방장만 공동 음악을 관리할 수 있어요.');
 if(action==='music-consent'){
  if(req.method!=='POST'||b.accept!==true)fail(400,'공동 감상 권리 확인에 동의해주세요.');
  const t=await published(env,b.track_id);if(t.user_id!==user.id||t.kind!=='original'||!t.rights_accepted)fail(403,'본인이 권리를 보유한 원곡만 허용할 수 있어요.');
  await run(env,'INSERT OR REPLACE INTO voice_music_permissions(track_id,owner_id,terms,accepted_at) VALUES(?,?,?,?)',t.id,user.id,VOICE_MUSIC_TERMS,now());return json({ok:true});
 }
 if(action==='music-search'){
  if(req.method!=='GET')fail(405,'허용되지 않는 요청이에요.');
  const q=(url.searchParams.get('q')||'').slice(0,100),where=VISIBLE()+" AND t.kind='original' AND t.rights_accepted>0 AND ("+permissionSQL+' OR t.user_id=?) AND (t.title LIKE ? OR a.name LIKE ? OR p.name LIKE ?)';
  const tracks=await trackList(env,where,[user.id,'%'+q+'%','%'+q+'%','%'+q+'%'],'t.created DESC',30);
  const grants=await rows(env,'SELECT track_id FROM voice_music_permissions WHERE terms=?',VOICE_MUSIC_TERMS);
  return json({tracks:tracks.map(t=>({...t,room_allowed:grants.some(g=>g.track_id===t.id),can_consent:t.user_id===user.id})),consent:VOICE_MUSIC_CONSENT});
 }
 if(action==='music'){
  if(req.method!=='POST')fail(405,'허용되지 않는 요청이에요.');
  const track=b.operation==='enqueue'?await roomTrack(env,b.track_id):undefined;
  return json(await call('music',{...b,track}));
 }
 if(!['GET','HEAD'].includes(req.method))fail(405,'허용되지 않는 요청이에요.');
 const id=url.searchParams.get('track_id');if(state.music?.queue[state.music.index]?.id!==id)fail(409,'현재 재생 중인 음악이 바뀌었어요.');
 await roomTrack(env,id);
 const mediaUrl=new URL('/media/'+id+'/stream',req.url);
 return mediaRoute(new Request(mediaUrl,{method:req.method,headers:req.headers}),env,mediaUrl.pathname,user);
}
