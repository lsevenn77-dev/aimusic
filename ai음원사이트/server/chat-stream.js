import {one,now,fail} from './db.js';
import {cookies,hash,requireUser} from './auth.js';

// Cross-instance, database-backed notifications: one indexed check/client/sec.
// A bounded stream stays below the free D1 per-invocation query limit.
export function chatEventStream(req,readState,{intervalMs=1000,durationMs=20000}={}){
 const encoder=new TextEncoder();let stopped=false,timer,wake,controller;
 const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);wake?.();req.signal.removeEventListener('abort',stop);try{controller?.close();}catch{}};
 const send=(event,data)=>{if(!stopped)try{controller.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));}catch{stop();}};
 const body=new ReadableStream({start(c){controller=c;req.signal.addEventListener('abort',stop,{once:true});
  if(req.signal.aborted){stop();return;}
  void(async()=>{let previous;const started=Date.now();
   try{while(!stopped&&Date.now()-started<durationMs){
    const state=await readState();if(stopped)break;
    if(!state){send('revoked',{error:'로그인 또는 크루 가입 상태를 다시 확인해주세요.'});return;}
    const revision=JSON.stringify(state);
    if(revision!==previous){send('change',{});previous=revision;}else send('heartbeat',{});
    await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,intervalMs);});wake=null;
   }
   if(!stopped)send('rotate',{});
   }catch{if(!stopped)send('retry',{});}finally{stop();}
  })().catch(stop);
 },cancel(){stop();}});
 return new Response(body,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store, no-transform','x-content-type-options':'nosniff'}});
}

export async function chatStreamRoute(req,env,path,user){
 if(path!=='/api/chat/events')return null;
 requireUser(user);if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const url=new URL(req.url),origin=req.headers.get('origin');
 if(req.headers.get('sec-fetch-site')==='cross-site'||origin&&origin!==url.origin)fail(403,'사이트에서 다시 연결해주세요.');
 const crew=url.searchParams.get('crew'),peer=url.searchParams.get('peer');
 if(crew&&peer||[crew,peer].some(v=>v!==null&&!/^[\w-]{1,80}$/.test(v)))fail(400,'대화방을 확인해주세요.');
 const token=await hash(cookies(req).aifect_session||'');
 const session='s.token=? AND s.user_id=? AND s.expires>?';
 let readState;
 if(crew){
  readState=()=>one(env,'SELECT cm.role,cm.joined_sequence,COALESCE((SELECT rowid FROM crew_messages WHERE crew_id=cm.crew_id AND rowid>=cm.joined_sequence ORDER BY rowid DESC LIMIT 1),0) sequence FROM sessions s JOIN crew_members cm ON cm.user_id=s.user_id AND cm.crew_id=? WHERE '+session,crew,token,user.id,now());
 }else{
  const p=peer?await one(env,'SELECT user_id FROM producers WHERE id=?',peer):null;
  if(peer&&(!p||p.user_id===user.id))fail(404,'대화 상대를 찾을 수 없어요.');
  // Separate indexed directions avoid sorting the entire DM history.
  readState=()=>one(env,'SELECT COALESCE((SELECT rowid FROM direct_messages WHERE sender_id=s.user_id'+(p?' AND recipient_id=?':'')+' ORDER BY rowid DESC LIMIT 1),0) sent,COALESCE((SELECT rowid FROM direct_messages WHERE recipient_id=s.user_id'+(p?' AND sender_id=?':'')+' ORDER BY rowid DESC LIMIT 1),0) received'+(p?',(SELECT count(*) FROM direct_messages WHERE sender_id=s.user_id AND recipient_id=? AND read_at=0) awaiting_read':',(SELECT count(*) FROM direct_messages WHERE recipient_id=s.user_id AND read_at=0) unread')+' FROM sessions s WHERE '+session,...(p?[p.user_id,p.user_id,p.user_id]:[]),token,user.id,now());
 }
 if(!await readState())fail(403,'로그인 또는 크루 가입 상태를 다시 확인해주세요.');
 return chatEventStream(req,readState);
}

