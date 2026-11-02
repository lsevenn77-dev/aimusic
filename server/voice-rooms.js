import {talkingRoomPage} from './talking-directory.js';
import {roomThemeChoices,assertRoomTheme,saveRoomTheme,resolveRoomDecoration,decorateRoomResult} from './room-decorations.js';
import {voiceMusicRoute} from './voice-music.js';
import {voiceKaraokeRoute} from './voice-karaoke.js';
import {one,rows,run,rate,json,fail,str} from './db.js';
import {requireUser,hash,viewerBlockedIds} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {giftRoute} from './gifts.js';
import {socialRoute} from './social.js';
import {dispatchPush} from './push.js';
import {voiceCall,voiceConfigured} from './voice-bridge.js';
export {voiceCall,voiceConfigured} from './voice-bridge.js';
import {identifier,requestId} from '../realtime/protocol.js';
import {giftById} from '../shared/gifts.js';

const talkTitles=['자유토크방','음악과 수다','편하게 이야기해요','잠깐 쉬어가는 방','오늘도 반가워요','함께 듣는 음악','소소한 이야기','지금은 수다 시간'];
function suggestedTalkTitle(key){
 let index=0;
 for(const char of key)index=(index*31+char.charCodeAt(0))>>>0;
 return talkTitles[index%talkTitles.length];
}
async function result(response) {const r=await response.json();if(!response.ok)fail(response.status,r.error||'토킹룸 연결에 실패했어요.');return r;}

// Only server-issued receipt events survive this match. Ordinary chat text,
// timestamps and the recipient's profile are never evidence of a room gift.
async function rememberRoomReceipts(env,source,chat){
 const receipts=chat.filter(m=>m.kind==='gift'&&m.gift?.id&&m.id==='gift-'+m.gift.id)
  .map(m=>({id:m.gift.id,sender:m.user_id}));
 if(!receipts.length)return;
 await run(env,`INSERT INTO gift_sources(currency,gift_id,source_type,source_id,source_title)
  SELECT 'gold',g.id,?,?,? FROM json_each(?) e JOIN gifts g ON g.id=json_extract(e.value,'$.id')
  AND g.sender_id=json_extract(e.value,'$.sender') WHERE g.track_id IS NULL
  ON CONFLICT(currency,gift_id) DO NOTHING`,source.type,source.id,source.title,JSON.stringify(receipts));
}
export async function voiceRoomsRoute(req,env,path,user,ctx) {
 if(!path.startsWith('/api/voice/'))return null;
 if(path==='/api/voice/status'&&req.method==='GET')return json({enabled:voiceConfigured(env),max_members:30,mic_seats:8});
 if(path==='/api/voice/public-rooms'&&req.method==='GET'&&new URL(req.url).searchParams.has('limit')){
  if(!voiceConfigured(env))return json({enabled:false,rooms:[],next_cursor:null,crews:[]});
  const read=(action,input)=>voiceCall(env,{id:'public-directory'},'directory',action,input).then(result);
  return talkingRoomPage(env,user,new URL(req.url).searchParams,read);
 }
 if(path==='/api/voice/public-rooms'&&req.method==='GET')return json({...await decorateRoomResult(env,await result(await voiceCall(env,{id:'public-directory',crews:[],followedHosts:[],blocks:[]},'directory','list'))),crews:[]});
 requireUser(user);
 // A realtime page must not cache another user's room membership or permission.
 const [crews,followed]=await Promise.all([
  rows(env,'SELECT c.id,c.name FROM crews c JOIN crew_members m ON m.crew_id=c.id WHERE m.user_id=? LIMIT 50',user.id),
  rows(env,"SELECT DISTINCT p.user_id FROM follows f JOIN producers p ON p.id=f.target_id WHERE f.user_id=? AND f.kind='producer'",user.id)
 ]);
 // Authentication already resolves the privacy-safe public nickname. Crew
 // membership still authorizes room access, but is not part of a room label.
 const actor={id:user.id,profile_id:user.profile_id||null,name:user.name,image_version:user.image_version||'',crews:crews.map(c=>c.id),followedHosts:followed.map(p=>p.user_id),blocks:viewerBlockedIds(user)||[]};
 if(path==='/api/voice/options'&&req.method==='GET'){
  const themes=await roomThemeChoices(env,user.id);
  return json({crews,themes,suggested_title:suggestedTalkTitle(crypto.randomUUID()),preferred_theme:themes.find(t=>t.paid)?.sku||'navy'});
 }
 if(path==='/api/voice/rooms'&&req.method==='GET')return json({...await decorateRoomResult(env,await result(await voiceCall(env,actor,'directory','list'))),crews});
 if(path==='/api/voice/rooms'&&req.method==='POST') {
  if(!actor.profile_id)fail(409,'마이에서 프로필을 먼저 만들어주세요.');
  await rate(env,'voice-create:'+user.id,5,3600);const b=await req.json();
  const selected=await assertRoomTheme(env,user.id,b.theme_sku||b.background||(await roomThemeChoices(env,user.id)).find(t=>t.paid)?.sku||'navy');
  const roomId=requestId(b.request_id);
  const title=b.mode==='karaoke'?str(b.title,60):str(b.title??'',60,false)||suggestedTalkTitle(roomId);
  const data=await result(await voiceCall(env,actor,roomId,'create',{title,visibility:b.visibility,crew_id:b.crew_id,max_members:b.max_members,theme_sku:selected,background:selected.startsWith('theme_')?'navy':selected,announcement:b.announcement,seating_mode:b.seating_mode,mode:b.mode}));
  await saveRoomTheme(env,actor,data.room,selected,{creating:true});return json(await decorateRoomResult(env,data),201);
 }
 const m=path.match(/^\/api\/voice\/rooms\/([\w-]+)\/([a-z-]+)$/);if(!m)fail(404,'토킹룸을 찾을 수 없어요.');
 const [,room,action]=m;
 if(action==='socket'&&req.method==='GET') {
  if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('upgrade')?.toLowerCase()!=='websocket')fail(403,'사이트에서 토킹룸에 다시 입장해주세요.');
  const generation=new URL(req.url).searchParams.get('generation');if(!generation)fail(409,'토킹룸에 다시 입장해주세요.');return voiceCall(env,actor,room,'socket',{generation},true);
 }
 if(action==='theme'&&req.method==='GET'){
  const data=await result(await voiceCall(env,actor,room,'state'));return json({theme:await resolveRoomDecoration(env,data.room)});
 }
 if(action==='state'&&req.method==='GET')return json(await decorateRoomResult(env,await result(await voiceCall(env,actor,room,'state'))));
 if(['karaoke-search','karaoke'].includes(action)){const b=req.method==='POST'?await req.json():{};await rate(env,'voice-karaoke:'+user.id,90,60);return voiceKaraokeRoute(req,env,room,action,b,async(a,input)=>{const data=await result(await voiceCall(env,actor,room,a,input));return a==='state'?data:decorateRoomResult(env,data);});}
 if(['music-search','music-stream','music-consent','music'].includes(action)){const b=req.method==='POST'?await req.json():{};await rate(env,'voice-music:'+user.id,90,60);return voiceMusicRoute(req,env,user,room,action,b,async(a,input)=>result(await voiceCall(env,actor,room,a,input)));}
 if(req.method!=='POST')fail(405,'허용되지 않는 요청이에요.');
 await rate(env,'voice-api:'+user.id,180,60);
 const b=await req.json();
 if(action==='settings'){
  const current=await result(await voiceCall(env,actor,room,'state'));
  if(current.room.host_id!==user.id)fail(403,'방장만 테마를 변경할 수 있어요.');
  const selected=await assertRoomTheme(env,user.id,b.theme_sku||b.background||(await resolveRoomDecoration(env,current.room)).sku);
  const data=await result(await voiceCall(env,actor,room,'settings',{...b,theme_sku:selected,background:selected.startsWith('theme_')?'navy':selected}));
  await saveRoomTheme(env,actor,data.room,selected);return json(await decorateRoomResult(env,data));
 }
 if(action==='invite') {
  const target=await one(env,"SELECT id,user_id,name FROM producers WHERE id=? AND user_id IN (SELECT id FROM users WHERE provider!='deleted')",identifier(b.profile_id));if(!target)fail(404,'회원이 없어요.');
  await assertUnblocked(env,user,target.user_id);const rid=requestId(b.request_id);
  const targetCrews=await rows(env,'SELECT crew_id FROM crew_members WHERE user_id=?',target.user_id);
  const {room:info}=await result(await voiceCall(env,actor,room,'invite',{generation:b.generation,target_id:target.user_id,target_crews:targetCrews.map(c=>c.crew_id)}));
  const dmPath='/api/dm/'+target.id;
  const response=await socialRoute(new Request(new URL(dmPath,req.url),{method:'POST',body:JSON.stringify({request_id:await hash('voice-invite:'+room+':'+rid),body:`「${info.title}」 ${info.mode==='karaoke'?'라이브 노래방':'토킹룸'}에 초대해요.\nhttps://aifect.co.kr/#${info.mode==='karaoke'?'live':'voice'}/${room}`})}),env,dmPath,user);
  if(response.ok&&ctx?.waitUntil)ctx.waitUntil(dispatchPush(env));return response;
 }
 if(action==='gifts') {
  if(!giftById(b.gift_type))fail(400,'골드 선물을 선택해주세요.');
  const pid=identifier(b.profile_id),rid=await hash('voice-gift:'+room+':'+requestId(b.request_id));
  const target=await one(env,"SELECT id,user_id,name FROM producers WHERE id=? AND user_id IN (SELECT id FROM users WHERE provider!='deleted')",pid);if(!target)fail(404,'회원이 없어요.');
  await assertUnblocked(env,user,target.user_id);
  const prior=await one(env,'SELECT id FROM gifts WHERE sender_id=? AND request_id=?',user.id,rid);
  let source,history;
  if(!prior){
   const state=await result(await voiceCall(env,actor,room,'state',{generation:b.generation}));
   if(!state.members.some(member=>member.id===target.user_id&&member.profile_id===pid))fail(404,'선물 받을 회원이 방을 나갔어요.');
   if(state.room?.id!==room||!state.room.title||state.room.closed)fail(409,'방 정보를 다시 확인해주세요.');
   source={type:state.room.mode==='karaoke'?'karaoke':'talking_room',id:room,title:state.room.title};
   history=state.chat;
  }
  // Server catalogue and existing atomic FIFO ledger remain the sole authority for price and settlement.
  const giftPath='/api/producers/'+pid+'/gifts';
  const response=await giftRoute(new Request(new URL(giftPath,req.url),{method:'POST',body:JSON.stringify({gift_type:b.gift_type,quantity:b.quantity,request_id:rid})}),env,giftPath,user,source);
  if(!response.ok)return response;
  const receipt=await response.json();if(receipt.gift.free)fail(400,'토킹룸에서는 골드 선물을 선택해주세요.');
  if(history?.length&&ctx?.waitUntil)ctx.waitUntil(rememberRoomReceipts(env,source,history));
  let animation_pending=false;
  // Only the room broadcast needs the seat owner's ID. The client receipt and stored chat keep their existing shape.
  const roomReceipt={...receipt.gift,target_id:target.user_id};
  try{await result(await voiceCall(env,actor,room,'gift-receipt',{generation:b.generation,receipt:roomReceipt,target_name:target.name}));}catch{animation_pending=true;}
  if(ctx?.waitUntil)ctx.waitUntil(dispatchPush(env));
  return json({...receipt,animation_pending},response.status);
 }
 const allowed=['join','heartbeat','leave','close','settings','seat-invite','seat-answer','self-mute','request-mic','cancel-mic','reject-mic','approve-mic','release-mic','mute','moderate','chat','publish','published','subscribe','answer'];
 if(!allowed.includes(action))fail(404,'지원하지 않는 토킹룸 요청이에요.');
 const response=await voiceCall(env,actor,room,action,b);
 // The transport service owns membership and audio, while the Site owns paid
 // theme/frame entitlement. Native listeners receive both on entry/refresh.
 if(response.ok&&['join','heartbeat'].includes(action))return json(await decorateRoomResult(env,await response.json()),response.status);
 return response;
}
