import {reply, fault, identifier, verifyRequest} from './protocol.js';
export {VoiceRoom} from './room.js';
export default {async fetch(req, env) {
 try {
  const socket=req.method==='GET'&&new URL(req.url).pathname.endsWith('/socket');
  if(req.method!=='POST'&&!socket)fault(405,'허용되지 않는 요청이에요.');
  if(Number(req.headers.get('content-length'))>40000)fault(413,'요청이 너무 커요.');
  const bytes=socket?Uint8Array.from(atob(req.headers.get('x-voice-payload')||''),c=>c.charCodeAt(0)):await req.arrayBuffer();if(bytes.byteLength>40000)fault(413,'요청이 너무 커요.');
  const body=new TextDecoder().decode(bytes);const stamp=await verifyRequest(req,env.VOICE_BRIDGE_SECRET,body);
  const data=JSON.parse(body);identifier(data.actor?.id);
  const match=new URL(req.url).pathname.match(/^\/rooms\/([\w-]+)\/([a-z-]+)$/);
  if(!match)fault(404,'토킹룸을 찾을 수 없어요.');
  const [,id,action]=match;
  if(id==='directory'&&action==='list') {
   const crews=(data.actor.crews||[]).slice(0,50),followed=(data.actor.followedHosts||[]);
   const result=await env.ROOM_DB.prepare(`SELECT id,title,host_id,visibility,crew_id,created FROM voice_rooms WHERE closed=0 AND (visibility='public' OR host_id=? OR (visibility='crew' AND crew_id IN (${crews.map(()=>'?').join(',')||"''"})) OR (visibility='followers' AND host_id IN (SELECT value FROM json_each(?)))) ORDER BY created DESC LIMIT 100`).bind(data.actor.id,...crews,JSON.stringify(followed)).all();
   const active=await Promise.all(result.results.map(async room=>{
    const response=await env.ROOMS.get(env.ROOMS.idFromName(room.id)).fetch(new Request('https://room/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:data.actor,input:{},stamp,roomId:room.id})}));
    if(!response.ok)fault(503,'토킹룸 목록을 새로 불러오지 못했어요. 다시 시도해주세요.');
    return (await response.json()).active?room:null;
   }));
   return reply({rooms:active.filter(Boolean)});
  }
  const payload=JSON.stringify({...data,stamp,roomId:id});
  const headers=socket?{upgrade:'websocket','x-room-payload':btoa(String.fromCharCode(...new TextEncoder().encode(payload)))}:{'content-type':'application/json'};
  return env.ROOMS.get(env.ROOMS.idFromName(identifier(id))).fetch(new Request('https://room/'+action,{method:socket?'GET':'POST',headers,body:socket?undefined:payload}));
 } catch(e) {return reply({error:e.status?e.message:'토킹룸 연결에 실패했어요.'},e.status||500);}
}};
