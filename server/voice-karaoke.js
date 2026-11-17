import {currentArtworkURL} from './track-artwork.js';
// Live karaoke uses the existing authorised MR/word-timing catalogue.
// Never send a caller-provided track object to the room coordinator.
import {json,fail,rows} from './db.js';
import {VISIBLE,SINGABLE} from './catalog.js';
import {namedArtistSQL} from './artist-identity.js';
import {producerNameSQL} from './identity.js';
import {identifier} from '../realtime/protocol.js';

const readable=t=>({id:t.id,title:t.title,artist:t.artist||t.producer,artist_id:t.artist_id,has_ai_artist:t.has_ai_artist,producer:t.producer,producer_id:t.producer_id,user_id:t.user_id,duration:t.duration,
 cover:currentArtworkURL(t)});
// Reuse the creator's recorded AIFECT karaoke MR/cover permission, without
// widening it to unconsented, unavailable, or unsupported-length recordings.
const eligible=()=>`${VISIBLE()} AND ${SINGABLE()} AND t.rights_accepted>0 AND t.duration>0 AND t.duration<=600`;
// The room needs catalogue labels, not the full public card's engagement totals.
// Keep consent, readiness and the caller's block list authoritative on every request.
async function liveTracks(env,where,args,limit,offset=0){
 const blocked=env.AIFECT_BLOCKED||[];
 return rows(env,`SELECT t.id,t.title,t.duration,t.artist_id,t.producer_id,t.user_id,${namedArtistSQL()} has_ai_artist,${producerNameSQL()} producer,t.cover_version,CASE WHEN (t.has_cover=1 OR t.cover_version!='') AND t.cover_version NOT LIKE 'profile-%' THEN t.id END artwork_id,
  CASE WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL()} END artist
  FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id
  WHERE ${eligible()} AND ${where}${blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''}
  ORDER BY t.created DESC,t.id LIMIT ? OFFSET ?`,...args,...blocked,limit,offset);
}

export async function voiceKaraokeRoute(req,env,room,action,body,call){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'노래방 요청을 확인해주세요.');
 const url=new URL(req.url),generation=body.generation||url.searchParams.get('generation');
 if(typeof generation!=='string'||!generation)fail(409,'노래방에 다시 입장해주세요.');
 const state=await call('state',{generation});
 if(state.room?.mode!=='karaoke')fail(409,'라이브 노래방에서만 사용할 수 있어요.');
 if(action==='karaoke-search'){
  if(req.method!=='GET')fail(405,'허용되지 않는 요청이에요.');
  const q=(url.searchParams.get('q')||'').trim().slice(0,80);
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0)fail(400,'검색 페이지를 확인해주세요.');
  if(!q){
   const collection=url.searchParams.get('collection');if(!['mine','popular'].includes(collection))return json({tracks:[]});
   const library=await call('karaoke-library',{generation,collection});
   const ids=(library.tracks||[]).filter(id=>typeof id==='string').slice(0,100);if(!ids.length)return json({tracks:[]});
   const tracks=await liveTracks(env,'t.id IN ('+ids.map(()=>'?').join(',')+')',ids,100),order=new Map(ids.map((id,i)=>[id,i]));
   return json({tracks:tracks.sort((a,b)=>order.get(a.id)-order.get(b.id)).slice(offset,offset+30).map(readable),next:tracks.length>offset+30?offset+30:null});
  }
  const where=`(t.title LIKE ? OR a.name LIKE ? OR (${producerNameSQL()}) LIKE ?)`;
  const tracks=await liveTracks(env,where,['%'+q+'%','%'+q+'%','%'+q+'%'],31,offset);
  return json({tracks:tracks.slice(0,30).map(readable),next:tracks.length>30?offset+30:null});
 }
 if(action!=='karaoke'||req.method!=='POST')fail(405,'허용되지 않는 요청이에요.');
 const allowed=['request','cancel','call','accept','start','abandon','finish','next','key','invite','answer-invite'];
 if(!allowed.includes(body.operation))fail(400,'노래방 동작을 확인해주세요.');
 let track;
 if(body.operation==='request'){
  const id=identifier(body.track_id);
  const result=await liveTracks(env,'t.id=?',[id],1);
  if(!result.length)fail(404,'부를 수 있는 곡이 아니거나 MR·가사가 준비되지 않았어요.');
  track=readable(result[0]);
 }
 if(body.operation==='start'&&state.karaoke?.active?.track){
  const id=state.karaoke.active.track.id;
  const available=await liveTracks(env,'t.id=?',[id],1);
  if(!available.length)fail(409,'선택한 곡은 더 이상 라이브 노래방에서 사용할 수 없어요.');
 }
 return json(await call('karaoke',{...body,track}));
}
