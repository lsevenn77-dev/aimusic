import {fault,reply,identifier,requestId,text,audioOffer,audioAnswer} from './protocol.js';
import {Sfu} from './sfu.js';
const LEASE=75000;
export class VoiceRoom {
 constructor(ctx,env) {this.ctx=ctx;this.env=env;this.sfu=new Sfu(env);this.queue=Promise.resolve();this.data=null;}
 serial(work) {const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
 async load() {
  if(this.data)return;
  this.data=await this.ctx.storage.get('room')||{config:null,members:{},bans:{},invites:{},chat:[],gifts:[],cleanup:[],nonces:{},rates:{},revision:0,chatSequence:0};
  // Older rooms have no reliable per-member history boundary. Start a fresh boundary on upgrade.
  if(!Number.isSafeInteger(this.data.chatSequence)) {
   this.data.chatSequence=0;for(const message of this.data.chat)message.sequence=++this.data.chatSequence;
   for(const member of Object.values(this.data.members))member.chatAfter=this.data.chatSequence;
  }
 }
 async save() {await this.ctx.storage.put('room',this.data);if(Object.keys(this.data.members).length||this.data.cleanup.length||this.data.directoryDirty)await this.ctx.storage.setAlarm(Date.now()+15000);}
 async syncDirectory() {
  if(!this.data.directoryDirty)return;
  try{await this.env.ROOM_DB.prepare('UPDATE voice_rooms SET closed=1 WHERE id=?').bind(this.data.config.id).run();this.data.directoryDirty=false;}catch{/* Retry from the persisted alarm; the DO already refuses entry. */}
 }
 async closeRoom() {
  if(!this.data.config||this.data.config.closed)return;
  this.data.config.closed=true;this.data.chat=[];this.data.invites={};this.data.directoryDirty=true;
  await this.save();await this.syncDirectory();
 }
 member(actor, generation) {
  const p=this.data.members[actor.id];if(!p||p.expires<=Date.now())fault(403,'토킹룸에 다시 입장해주세요.');
  if(generation!==undefined&&p.generation!==generation)fault(409,'다른 연결로 바뀌었어요. 다시 입장해주세요.');
  return p;
 }
 access(actor) {
  const c=this.data.config;if(!c||c.closed)fault(404,'종료되었거나 없는 토킹룸이에요.');
  if(this.data.bans[actor.id]>Date.now())fault(403,'이 방에 입장할 수 없어요.');
  if((actor.blocks||[]).some(id=>this.data.members[id]))fault(403,'차단한 관계의 회원이 있는 방에는 입장할 수 없어요.');
  if(c.visibility==='crew'&&!(actor.crews||[]).includes(c.crew_id))fault(403,'이 크루의 멤버만 입장할 수 있어요.');
  if(c.visibility==='private'&&c.host_id!==actor.id&&!this.data.members[actor.id]&&!(this.data.invites[actor.id]>Date.now()))fault(403,'초대받은 회원만 입장할 수 있어요.');
 }
 moderator(actor) {const p=this.member(actor);if(!['host','admin'].includes(p.role))fault(403,'방장 또는 관리자만 할 수 있어요.');return p;}
 target(actor,id) {const by=this.moderator(actor),p=this.data.members[identifier(id)];if(!p)fault(404,'이미 나간 회원이에요.');if(p.role==='host'||(p.role==='admin'&&by.role!=='host'))fault(403,'이 회원을 관리할 권한이 없어요.');return p;}
 limited(actor,action,max) {const k=actor.id+':'+action,now=Date.now();let v=this.data.rates[k];if(!v||v.until<=now)v=this.data.rates[k]={n:0,until:now+60000};if(++v.n>max)fault(429,'잠시 기다린 뒤 다시 시도해주세요.');}
 snapshot(actor) {
  const p=this.data.members[actor.id];return {room:this.data.config,revision:this.data.revision,self:p?.id||null,generation:p?.generation||null,cleanup_pending:this.data.cleanup.length>0,members:Object.values(this.data.members).filter(m=>m.expires>Date.now()).map(m=>({id:m.id,profile_id:m.profile_id,name:m.name,image_version:m.image_version,role:m.role,seat:m.seat,requested:m.requested,muted:m.muted,locked:m.locked,publishing:!!m.pub?.ready,mediaKey:m.pub?.ready?m.generation+':'+m.pub.trackName:null})),chat:p?this.data.chat.filter(m=>m.sequence>(p.chatAfter??this.data.chatSequence)):[]};
 }
 notify(event={type:'changed'}) {
  for(const ws of this.ctx.getWebSockets?.()||[]) {try {const a=ws.deserializeAttachment(),p=this.data.members[a.id];if(!p||p.generation!==a.generation||p.expires<=Date.now()){ws.close(4001,'Rejoin required');continue;}ws.send(JSON.stringify(event));}catch{}}
 }
 async audit(actor,action,target=null) {await this.env.ROOM_DB.prepare('INSERT INTO voice_room_events(id,room_id,actor_id,action,target_id,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),this.data.config.id,actor.id,action,target,Date.now()).run();}
 queueRetire(media) {
  if(!media?.sessionId)return;
  if(!this.data.cleanup.some(c=>c.sessionId===media.sessionId))this.data.cleanup.push({sessionId:media.sessionId,owner:media.owner,mids:media.mids||[],uncertain:!!media.uncertain,expected:media.expected||1,after:Date.now()+2000,tries:0});
 }
 async retire(media) {
  if(!media?.sessionId)return;
  // Persist cleanup intent before an external call. Failed cleanup never gets forgotten.
  this.queueRetire(media);
  await this.save();
  try{const result=await this.sfu.close(media.sessionId,media.mids||[],media);if(result?.resolved!==false)this.data.cleanup=this.data.cleanup.filter(c=>c.sessionId!==media.sessionId);}catch{}
 }
 async stopPublish(p) {const old=p.pub;p.pub=null;p.muted=true;await this.retire(old);}
 async remove(p) {
  delete this.data.members[p.id];this.queueRetire(p.pub);this.queueRetire(p.sub);
  // Remove the directory entry before waiting for SFU cleanup.
  if(!Object.keys(this.data.members).length)await this.closeRoom();
  await this.retire(p.pub);await this.retire(p.sub);this.notify();
 }
 async expire() {
  const now=Date.now();for(const [k,t] of Object.entries(this.data.nonces))if(t<now-30000)delete this.data.nonces[k];
  for(const [k,v] of Object.entries(this.data.rates))if(v.until<now)delete this.data.rates[k];
  for(const [k,t] of Object.entries(this.data.invites))if(t<now)delete this.data.invites[k];
  for(const p of Object.values(this.data.members)) {
   if(p.expires<=now)await this.remove(p);
   else if(p.pub&&!p.pub.ready&&p.pub.deadline<Date.now())await this.stopPublish(p);
   else if(p.sub?.deadline&&p.sub.deadline<now){const old=p.sub;p.sub=null;await this.retire(old);}
  }
  if(!Object.keys(this.data.members).length)await this.closeRoom();
  await this.syncDirectory();
 }
 async alarm() {return this.serial(async()=>{await this.load();await this.expire();for(const c of [...this.data.cleanup]){if(c.after>Date.now())continue;try{const result=await this.sfu.close(c.sessionId,c.mids,c);if(result?.resolved!==false)this.data.cleanup=this.data.cleanup.filter(x=>x!==c);else c.after=Date.now()+60000;}catch{c.tries++;c.after=Date.now()+Math.min(60000,2000*2**Math.min(c.tries,5));}}await this.save();this.notify();});}
 async fetch(req) {return this.serial(async()=>{
  await this.load();try {
   const b=req.method==='GET'?JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(req.headers.get('x-room-payload')),c=>c.charCodeAt(0)))):await req.json(),actor=b.actor,action=new URL(req.url).pathname.slice(1);
   if(!actor?.id)fault(401,'로그인 후 이용해주세요.');
   await this.expire();
   if(!b.stamp||this.data.nonces[b.stamp.nonce])fault(409,'중복된 서버 요청이에요.');
   this.data.nonces[b.stamp.nonce]=b.stamp.timestamp;
   const result=await this.command(action,actor,b.input||{},b.roomId);
   return result instanceof Response?result:reply(result);
  }catch(e){return reply({error:e.status?e.message:'토킹룸 요청을 처리하지 못했어요.'},e.status||500);}
  finally {await this.save();}
 });}
 async command(action,actor,b,roomId) {
  const d=this.data;
  if(action==='create') {
   if(d.config){if(d.config.host_id===actor.id&&!d.config.closed)return {room:d.config};fault(409,'이미 사용 중인 방이에요.');}
   const visibility=['public','private','crew'].includes(b.visibility)?b.visibility:'public',crew=visibility==='crew'?identifier(b.crew_id):null;
   if(crew&&!(actor.crews||[]).includes(crew))fault(403,'가입한 크루만 선택할 수 있어요.');
   const config={id:identifier(roomId),title:text(b.title,60),host_id:actor.id,visibility,crew_id:crew,created:Date.now(),closed:false,max_members:30,mic_seats:8};
   await this.env.ROOM_DB.prepare('INSERT INTO voice_rooms(id,title,host_id,visibility,crew_id,created) VALUES(?,?,?,?,?,?)').bind(config.id,config.title,actor.id,visibility,crew,config.created).run();d.config=config;
   // Creation includes the host's listener membership; there is no empty room between create and navigation.
   await this.command('join',actor,{request_id:crypto.randomUUID()},roomId);return {room:config};
  }
  // Internal directory reconciliation also retires empty rooms left by an older release.
  if(action==='presence')return {active:!!d.config&&!d.config.closed&&Object.keys(d.members).length>0};
  // A deleted account or removed crew membership cannot keep a lease by sending heartbeats.
  try{this.access(actor);}catch(e){const old=d.members[actor.id];if(old)await this.remove(old);throw e;}
  if(action==='join') {
   this.limited(actor,'join',10);requestId(b.request_id);
   let p=d.members[actor.id];
   if(p&&p.joinRequest===b.request_id){p.expires=Date.now()+LEASE;return this.snapshot(actor);}
   if(!p&&Object.keys(d.members).length>=30)fault(409,'방이 가득 찼어요. 최대 30명까지 입장할 수 있어요.');
   const old=p; if(old){await this.stopPublish(old);await this.retire(old.sub);}
   p={id:actor.id,profile_id:actor.profile_id,name:actor.name,image_version:actor.image_version||'',role:old?.role||(actor.id===d.config.host_id?'host':'listener'),seat:old?.seat??null,requested:false,locked:old?.locked||false,muted:true,pub:null,sub:null,generation:crypto.randomUUID(),expires:Date.now()+LEASE,joinRequest:b.request_id,chatAfter:old?.chatAfter??d.chatSequence};
   d.members[actor.id]=p;d.revision++;this.notify();return this.snapshot(actor);
  }
  const p=this.member(actor,b.generation);
  this.limited(actor,'requests',180);
  if(action==='state'||action==='heartbeat') {p.expires=Date.now()+LEASE;return this.snapshot(actor);}
  if(action==='socket') {
   const pair=new WebSocketPair();for(const ws of this.ctx.getWebSockets?.()||[]){const a=ws.deserializeAttachment();if(a.id===actor.id)ws.close(4000,'Connection replaced');}
   this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({id:actor.id,generation:p.generation});return new Response(null,{status:101,webSocket:pair[0]});
  }
  if(action==='leave') {await this.remove(p);d.revision++;return {ok:true};}
  if(action==='close') {
   if(p.role!=='host')fault(403,'방장만 방을 종료할 수 있어요.');
   await this.closeRoom();
   for(const member of Object.values(d.members))await this.remove(member);await this.audit(actor,'close');return {ok:true};
  }
  if(action==='request-mic') {this.limited(actor,'mic',10);if(p.locked)fault(403,'관리자가 마이크 사용을 제한했어요.');p.requested=p.seat===null;}
  else if(action==='approve-mic') {
   this.moderator(actor);const t=d.members[identifier(b.target_id)];if(!t)fault(404,'회원이 나갔어요.');
   if(!t.requested&&t.id!==actor.id)fault(409,'마이크 신청을 먼저 받아주세요.');
   if(t.seat===null){const used=new Set(Object.values(d.members).map(m=>m.seat));const seat=Array.from({length:8},(_,i)=>i).find(i=>!used.has(i));if(seat===undefined)fault(409,'마이크 8석이 모두 사용 중이에요.');t.seat=seat;}
   t.locked=false;t.requested=false;t.muted=true;await this.audit(actor,'approve-mic',t.id);
  }
  else if(action==='release-mic') {await this.stopPublish(p);p.seat=null;p.requested=false;}
  else if(action==='mute') {await this.stopPublish(p);}
  else if(action==='moderate') {
   const t=this.target(actor,b.target_id);if(!['mute','unlock','kick','ban','admin','revoke-admin'].includes(b.operation))fault(400,'관리 작업을 확인해주세요.');
   if(['admin','revoke-admin'].includes(b.operation)&&p.role!=='host')fault(403,'방장만 관리자를 지정할 수 있어요.');
   if(b.operation==='mute'){t.locked=true;t.requested=false;await this.stopPublish(t);}
   if(b.operation==='unlock')t.locked=false;
   if(['kick','ban'].includes(b.operation)){d.bans[t.id]=b.operation==='ban'?Number.MAX_SAFE_INTEGER:Date.now()+60000;await this.remove(t);}
   if(b.operation==='admin')t.role='admin';if(b.operation==='revoke-admin')t.role='listener';
   await this.audit(actor,b.operation,t.id);
  }
  else if(action==='chat') {
   this.limited(actor,'chat',20);const rid=requestId(b.request_id),body=text(b.body,500),old=d.chat.find(m=>m.request_id===rid&&m.user_id===actor.id);
   if(old){if(old.body!==body)fault(409,'이미 사용한 메시지 요청이에요.');return {message:old};}
   const message={id:crypto.randomUUID(),request_id:rid,user_id:actor.id,name:p.name,body,created:Date.now(),sequence:++d.chatSequence};d.chat.push(message);d.chat=d.chat.slice(-100);d.revision++;this.notify();return {message};
  }
  else if(action==='invite') {
   this.limited(actor,'invite',10);if(d.config.visibility==='private')this.moderator(actor);
   const id=identifier(b.target_id);if(d.config.visibility==='crew'&&!(b.target_crews||[]).includes(d.config.crew_id))fault(403,'같은 크루 멤버만 초대할 수 있어요.');
   if(d.bans[id]>Date.now())fault(403,'차단된 회원은 초대할 수 없어요.');d.invites[id]=Date.now()+86400000;return {room:d.config};
  }
  else if(action==='gift-target') {const t=d.members[identifier(b.target_id)];if(!t||t.expires<=Date.now())fault(404,'선물 받을 회원이 방을 나갔어요.');return {target:{id:t.id,profile_id:t.profile_id}};}
  else if(action==='gift-receipt') {
   // This command is reached only through the authenticated bridge, after giftRoute confirms its receipt.
   const receipt=b.receipt;if(!receipt?.id||!Number.isSafeInteger(receipt.gold)||receipt.gold<1||!Number.isInteger(receipt.quantity)||receipt.quantity<1||receipt.quantity>100)fault(400,'선물 영수증을 확인해주세요.');
   const giftName=text(receipt.name,80),recipient=text(b.target_name,100);
   if(!d.gifts.includes(receipt.id)){
    const message={id:'gift-'+receipt.id,kind:'gift',user_id:p.id,name:p.name,recipient_name:recipient,gift:{id:receipt.id,type:receipt.type,name:giftName,quantity:receipt.quantity},body:`${p.name}님이 ${recipient}님에게 ${giftName} ×${receipt.quantity}을 보냈습니다.`,created:Date.now(),sequence:++d.chatSequence};
    d.gifts.push(receipt.id);d.gifts=d.gifts.slice(-500);d.chat.push(message);d.chat=d.chat.slice(-100);d.revision++;
    // Persist the receipt marker and chat notice together; retries cannot create a second notice.
    await this.save();this.notify({type:'gift',gift:receipt,from:p.name,to:recipient});
   }return {ok:true};
  }
  else if(action==='publish') {
   this.limited(actor,'media',15);if(p.seat===null||p.locked)fault(403,'승인된 마이크 좌석이 필요해요.');
   if(d.cleanup.some(c=>c.owner===p.id))fault(409,'이전 음성 연결을 정리하고 있어요. 잠시 후 다시 켜주세요.');
   if(p.pub)fault(409,'이미 연결 중인 마이크예요. 다시 연결해주세요.');
   const mid=identifier(b.mid),offer=audioOffer(b.sessionDescription,mid),sessionId=await this.sfu.create();
   const media=p.pub={sessionId,owner:p.id,mids:[mid],trackName:'mic-'+crypto.randomUUID(),ready:false,uncertain:true,expected:1,deadline:Date.now()+30000};await this.save();
   try{
    const r=await this.sfu.tracks(sessionId,{sessionDescription:offer,tracks:[{location:'local',mid,trackName:media.trackName}]});
    media.uncertain=false;media.mids=[...new Set([mid,...(r.tracks||[]).map(t=>t.mid).filter(Boolean)])];
    if(!r.sessionDescription||r.tracks?.some(t=>t.errorCode)||r.requiresImmediateRenegotiation)fault(502,'마이크 연결을 다시 시작해주세요.');
    media.deadline=Date.now()+30000;return {sessionDescription:r.sessionDescription};
   }catch(e){if(e.sfuUncertain)media.uncertain=true;await this.stopPublish(p);throw e;}
  }
  else if(action==='published') {
   if(p.seat===null||p.locked||!p.pub||(!p.pub.ready&&p.pub.deadline<Date.now()))fault(409,'마이크 연결을 다시 시작해주세요.');
   p.pub.ready=true;p.pub.deadline=0;p.muted=false;
  }
  else if(action==='subscribe') {
   this.limited(actor,'media',15);
   // Client never supplies SFU session IDs or track names. All permitted speakers are resolved here.
   const targets=Object.values(d.members).filter(m=>m.id!==p.id&&m.pub?.ready&&!m.muted&&m.expires>Date.now());
   const previous=p.sub;p.sub=null;await this.retire(previous);
   if(!targets.length)return {tracks:[]};
   const sessionId=await this.sfu.create(),sub=p.sub={sessionId,owner:p.id,mids:[],negotiation:crypto.randomUUID(),uncertain:true,expected:targets.length,deadline:Date.now()+15000};await this.save();
   try {
    const r=await this.sfu.tracks(sessionId,{tracks:targets.map(t=>({location:'remote',sessionId:t.pub.sessionId,trackName:t.pub.trackName}))});
    sub.uncertain=false;sub.mids=(r.tracks||[]).map(t=>t.mid).filter(Boolean);sub.deadline=Date.now()+30000;
    if(!r.sessionDescription||r.tracks?.some(t=>t.errorCode)||sub.mids.length!==targets.length||r.tracks.some(t=>!targets.some(m=>m.pub.trackName===t.trackName)))fault(502,'음성 수신 연결을 다시 시작해주세요.');
    return {sessionDescription:r.sessionDescription,negotiation:sub.negotiation,tracks:r.tracks.map(t=>({mid:t.mid,user_id:targets.find(m=>m.pub.trackName===t.trackName)?.id})),generation:p.generation};
   }catch(e){if(e.sfuUncertain)sub.uncertain=true;p.sub=null;await this.retire(sub);throw e;}
  }
  else if(action==='answer') {
   const sub=p.sub;if(!sub||sub.negotiation!==b.negotiation||!sub.deadline||sub.deadline<Date.now())fault(409,'음성 협상 시간이 만료되었어요.');
   const description=audioAnswer(b.sessionDescription,sub.mids);
   try{await this.sfu.answer(sub.sessionId,description);sub.deadline=0;return {ok:true};}catch(e){if(e.sfuUncertain)sub.uncertain=true;p.sub=null;await this.retire(sub);throw e;}
  }
  else fault(404,'지원하지 않는 토킹룸 요청이에요.');
  d.revision++;this.notify();return this.snapshot(actor);
 }
 webSocketMessage(ws) {ws.close(1008,'Use authenticated HTTP commands');}
 webSocketClose() {}
 webSocketError() {}
}
