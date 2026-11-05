import {talkingDirectoryCard} from './talking-directory.js';
import {roomSettings} from '../shared/voice-settings.js';
import {emptyRoomMusic,changeRoomMusic} from '../shared/voice-music.js';
import {fault,reply,identifier,requestId,text,audioOffer,audioAnswer} from './protocol.js';
import {Sfu} from './sfu.js';
const LEASE=75000;
const SEAT_REQUEST_TTL=10000;
export class VoiceRoom {
 constructor(ctx,env) {this.ctx=ctx;this.env=env;this.sfu=new Sfu(env);this.queue=Promise.resolve();this.data=null;this.cleaning=new Set();}
 serial(work) {const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
 async load() {
  if(this.data)return;
  this.data=await this.ctx.storage.get('room')||{config:null,members:{},bans:{},invites:{},chat:[],gifts:[],cleanup:[],nonces:{},rates:{},revision:0,chatSequence:0};
  this.data.seatInvites ||= {};this.data.music ||= emptyRoomMusic();this.data.musicRequests ||= [];this.data.notices ||= [];
  if(this.data.config)this.data.config.seating_mode??='approval';
  // Older rooms have no reliable per-member history boundary. Start a fresh boundary on upgrade.
  if(!Number.isSafeInteger(this.data.chatSequence)) {
   this.data.chatSequence=0;for(const message of this.data.chat)message.sequence=++this.data.chatSequence;
   for(const member of Object.values(this.data.members))member.chatAfter=this.data.chatSequence;
  }
 }
 async save() {await this.ctx.storage.put('room',this.data);if(Object.keys(this.data.members).length||this.data.cleanup.length||this.data.directoryDirty||this.data.hostReconnectUntil>Date.now())await this.ctx.storage.setAlarm(Date.now()+15000);}
 async syncDirectory() {
  if(!this.data.directoryDirty)return;
  try {
   const room=this.data.config;
   if(room.closed)await this.env.ROOM_DB.prepare('UPDATE voice_rooms SET closed=1 WHERE id=?').bind(room.id).run();
   else await this.env.ROOM_DB.prepare('UPDATE voice_rooms SET host_id=?,background=? WHERE id=?').bind(room.host_id,room.background,room.id).run();
   this.data.directoryDirty=false;
  }catch{/* An alarm retries the directory projection of the committed room. */}
 }
 async closeRoom() {
  if(!this.data.config||this.data.config.closed)return;
  this.data.config.closed=true;this.data.music=changeRoomMusic(this.data.music,{operation:'stop'});this.data.chat=[];this.data.invites={};this.data.seatInvites={};for(const m of Object.values(this.data.members))this.clearRequest(m);this.data.directoryDirty=true;
  await this.save();await this.syncDirectory();
 }
 member(actor, generation) {
  const p=this.data.members[actor.id];if(!p||p.expires<=Date.now())fault(403,'토킹룸에 다시 입장해주세요.');
  if(generation!==undefined&&p.generation!==generation)fault(409,'다른 연결로 바뀌었어요. 다시 입장해주세요.');
  return p;
 }
 access(actor,existing=false) {
  existing=existing&&this.data.members[actor.id]?.visibilityRetained===true;
  const c=this.data.config;if(!c||c.closed)fault(404,'종료되었거나 없는 토킹룸이에요.');
  if(this.data.bans[actor.id]>Date.now())fault(403,'이 방에 입장할 수 없어요.');
  if((actor.blocks||[]).some(id=>this.data.members[id]))fault(403,'차단한 관계의 회원이 있는 방에는 입장할 수 없어요.');
  if(!existing&&c.visibility==='followers'&&actor.id!==c.host_id&&!(actor.followedHosts||[]).includes(c.host_id))fault(403,'방장의 팔로워만 입장할 수 있어요.');
  if(!existing&&c.visibility==='crew'&&!(actor.crews||[]).includes(c.crew_id))fault(403,'이 크루의 멤버만 입장할 수 있어요.');
  // An invitation admits a member. Keeping their current seat in the room
  // does not require a second invitation after a host handoff or reconnect.
  if(c.visibility==='private'&&c.host_id!==actor.id&&!(this.data.members[actor.id]?.expires>Date.now())&&!(this.data.invites[actor.id]>Date.now()))fault(403,'초대받은 회원만 입장할 수 있어요.');
 }
 moderator(actor) {const p=this.member(actor);if(this.data.config.host_id!==p.id)fault(403,'방장만 할 수 있어요.');return p;}
 target(actor,id) {const by=this.moderator(actor),p=this.data.members[identifier(id)];if(!p)fault(404,'이미 나간 회원이에요.');if(p.role==='host'||(p.role==='admin'&&by.role!=='host'))fault(403,'이 회원을 관리할 권한이 없어요.');return p;}
 limited(actor,action,max) {const k=actor.id+':'+action,now=Date.now();let v=this.data.rates[k];if(!v||v.until<=now)v=this.data.rates[k]={n:0,until:now+60000};if(++v.n>max)fault(429,'잠시 기다린 뒤 다시 시도해주세요.');}
 snapshot(actor) {
  const p=this.data.members[actor.id],host=p?.id===this.data.config?.host_id;
  return {room:this.data.config,revision:this.data.revision,self:p?.id||null,generation:p?.generation||null,seat_invites:Object.values(this.data.seatInvites).filter(i=>i.target===p?.id&&i.expires>Date.now()),cleanup_pending:this.data.cleanup.length>0,serverNow:Date.now(),music:this.data.music,notices:p?this.data.notices.filter(n=>n.sequence>(p.chatAfter??this.data.chatSequence)):[],members:Object.values(this.data.members).filter(m=>m.expires>Date.now()).map(m=>({
   id:m.id,profile_id:m.profile_id,name:m.name,image_version:m.image_version,role:m.id===this.data.config.host_id?'host':m.role==='host'?'listener':m.role,seat:m.seat,
   // Request metadata is private to the applicant and host, in HTTP AND WebSocket snapshots.
   ...(host||m.id===p?.id?{requested:!!m.requested,requestedSeat:m.requestedSeat??null,requestExpires:m.requestExpires??null,requestVersion:m.requested?(m.requestVersion??m.requestExpires):null}:{}),
   muted:m.muted,locked:m.locked,publishing:!!m.pub?.ready,mediaKey:m.pub?.ready?m.generation+':'+m.pub.trackName:null
  })),chat:p?this.data.chat.filter(m=>m.sequence>(p.chatAfter??this.data.chatSequence)):[]};
 }
 notify(event={type:'changed'},recipients=null) {
  for(const ws of this.ctx.getWebSockets?.()||[]) {try {const a=ws.deserializeAttachment(),p=this.data.members[a.id];if(!p||p.generation!==a.generation||p.expires<=Date.now()){ws.close(4001,'Rejoin required');continue;}if(recipients&&!recipients.includes(p.id))continue;
   ws.send(JSON.stringify(event.type==='changed'?{type:'state',state:this.snapshot(p)}:event));
  }catch{}}
 }
 checkSeatRequest(member,body){
  if(body.expected_request_version!==undefined&&(!member.requested||(member.requestVersion??member.requestExpires)!==body.expected_request_version))fault(409,'좌석 신청 상태가 변경됐어요. 다시 확인해주세요.');
 }
 clearRequest(p){p.requested=false;p.requestedSeat=null;p.requestExpires=null;}
 clearRequests(){const affected=Object.values(this.data.members).filter(p=>p.requested);for(const p of affected)this.clearRequest(p);if(affected.length){this.data.revision++;this.notify({type:'changed'},[this.data.config.host_id,...affected.map(p=>p.id)]);}}
 async audit(actor,action,target=null) {await this.env.ROOM_DB.prepare('INSERT INTO voice_room_events(id,room_id,actor_id,action,target_id,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),this.data.config.id,actor.id,action,target,Date.now()).run();}
 queueRetire(media) {
  if(!media?.sessionId)return;
  if(!this.data.cleanup.some(c=>c.sessionId===media.sessionId))this.data.cleanup.push({sessionId:media.sessionId,owner:media.owner,kind:media.kind||'publish',mids:media.mids||[],uncertain:!!media.uncertain,expected:media.expected||1,after:Date.now()+2000,tries:0});
 }
 notice(p,body){this.data.notices.push({id:crypto.randomUUID(),kind:'system',user_id:p.id,name:p.name,body,created:Date.now(),sequence:++this.data.chatSequence});this.data.notices=this.data.notices.slice(-100);}
 startCleanup(job){
  if(this.cleaning.has(job.sessionId))return;this.cleaning.add(job.sessionId);
  const work=this.sfu.close(job.sessionId,job.mids,job).then(result=>({ok:result?.resolved!==false}),()=>({ok:false})).then(result=>this.serial(async()=>{const c=this.data.cleanup.find(c=>c.sessionId===job.sessionId);if(!c)return;if(result.ok)this.data.cleanup=this.data.cleanup.filter(c=>c!==job);else{c.tries++;c.after=Date.now()+Math.min(60000,2000*2**Math.min(c.tries,5));}await this.save();})).finally(()=>this.cleaning.delete(job.sessionId));
  this.ctx.waitUntil?.(work);work.catch(()=>{});
 }
 async retire(media) {if(!media?.sessionId)return;this.queueRetire(media);await this.save();this.startCleanup(this.data.cleanup.find(c=>c.sessionId===media.sessionId));}
 async stopPublish(p) {const old=p.pub;p.pub=null;p.muted=true;await this.retire(old);}
 // The caller holds the DO's serial queue. Membership, permissions and theme
 // are saved together before sockets see the new owner.
 electHost(now,recipient) {
  const d=this.data,room=d.config;
  const active=Object.values(d.members).filter(m=>m.expires>now);
  // Older persisted memberships already record the room sequence at admission.
  const order=m=>m.joinOrder??m.chatAfter??0;
  active.sort((a,b)=>order(a)-order(b)||(a.id<b.id?-1:a.id>b.id?1:0));
  const next=recipient||active[0];
  if(!next||room.closed)return;
  const previous=d.members[room.host_id];
  if(previous&&previous!==next)previous.role='listener';
  d.seatInvites={};this.clearRequests();
  if(!Object.values(d.members).some(m=>m!==next&&m.seat===0))next.seat=0;
  next.role='host';next.locked=false;this.clearRequest(next);delete d.seatInvites[next.id];
  room.host_id=next.id;room.background='navy';room.theme_sku='navy';
  room.settings_revision=(room.settings_revision||0)+1;
  d.hostReconnectUntil=0;delete d.hostReconnectGeneration;d.directoryDirty=true;
  // Admission to a followers room must survive a change of host.
  if(room.visibility==='followers')for(const m of active)m.visibilityRetained=true;
  this.notice(next,next.name+'님이 새 방장이 되었습니다.');
 }
 async remove(p,temporary=false) {
  const wasHost=p.id===this.data.config.host_id,talk=this.data.config.mode!=='karaoke';
  if(wasHost){this.clearRequests();this.data.seatInvites={};}
  delete this.data.seatInvites[p.id];
  if(temporary&&wasHost){this.data.hostReconnectUntil=Date.now()+300000;this.data.hostReconnectGeneration=p.generation;}
  if(wasHost&&!talk&&this.data.music?.playing)this.data.music=changeRoomMusic(this.data.music,{operation:'pause'});
  this.notice(p,p.name+'님이 퇴장했어요.');delete this.data.members[p.id];this.queueRetire(p.pub);this.queueRetire(p.sub);
  if(wasHost&&!temporary&&!this.data.config.closed)this.electHost(Date.now());
  this.data.revision++;
  // Commit the removal and any succession before broadcasting or SFU cleanup.
  if(!Object.keys(this.data.members).length&&!(this.data.hostReconnectUntil>Date.now()))await this.closeRoom();
  await this.save();await this.syncDirectory();this.notify();
  await this.retire(p.pub);await this.retire(p.sub);
 }
 async expire() {
  const now=Date.now();for(const [k,t] of Object.entries(this.data.nonces))if(t<now-30000)delete this.data.nonces[k];
  for(const [k,v] of Object.entries(this.data.rates))if(v.until<now)delete this.data.rates[k];
  for(const [k,i] of Object.entries(this.data.seatInvites))if(i.expires<=now||!this.data.members[i.target])delete this.data.seatInvites[k];
  for(const [k,t] of Object.entries(this.data.invites))if(t<now)delete this.data.invites[k];
  for(const p of Object.values(this.data.members)) {
   if(p.requested&&(!p.requestExpires||p.requestExpires<=now)){this.clearRequest(p);this.data.revision++;this.notify({type:'changed'},[p.id,this.data.config.host_id]);}
   if(p.expires<=now)await this.remove(p,true);
   else if(p.pub&&!p.pub.ready&&p.pub.deadline<Date.now())await this.stopPublish(p);
   else if(p.sub?.deadline&&p.sub.deadline<now){const old=p.sub;p.sub=null;await this.retire(old);}
  }
  if(this.data.config&&!this.data.config.closed&&!this.data.members[this.data.config.host_id]&&!(this.data.hostReconnectUntil>now)&&Object.keys(this.data.members).length){
   this.electHost(now);this.data.revision++;await this.save();this.notify();
  }
  if(!Object.keys(this.data.members).length&&!(this.data.hostReconnectUntil>Date.now()))await this.closeRoom();
  const music=this.data.music;let guard=0;
  while(music?.playing&&music.index>=0&&guard++<50&&music.position+Math.max(0,Date.now()-music.updated)/1000>=music.queue[music.index].duration){
   const endedAt=music.updated+(music.queue[music.index].duration-music.position)*1000;
   Object.assign(music,changeRoomMusic(music,{operation:'ended',revision:music.revision},undefined,endedAt));this.data.revision++;this.notify();
  }
  await this.syncDirectory();
 }
 async alarm() {return this.serial(async()=>{await this.load();await this.expire();for(const c of this.data.cleanup){if(c.after<=Date.now())this.startCleanup(c);}await this.save();this.notify();});}
 async fetch(req) {const response=await this.serial(async()=>{
  await this.load();try {
   const b=req.method==='GET'?JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(req.headers.get('x-room-payload')),c=>c.charCodeAt(0)))):await req.json(),actor=b.actor,action=new URL(req.url).pathname.slice(1);
   if(!actor?.id)fault(401,'로그인 후 이용해주세요.');
   await this.expire();
   if(!b.stamp||this.data.nonces[b.stamp.nonce])fault(409,'중복된 서버 요청이에요.');
   this.data.nonces[b.stamp.nonce]=b.stamp.timestamp;
   if(['publish','subscribe','answer'].includes(action))return {media:await this.prepareMedia(action,actor,b.input||{})};
   const result=await this.command(action,actor,b.input||{},b.roomId);
   return result instanceof Response?result:reply(result);
  }catch(e){return reply({error:e.status?e.message:'토킹룸 요청을 처리하지 못했어요.'},e.status||500);}
  finally {await this.save();}
 });if(response?.media){try{return reply(await response.media());}catch(e){return reply({error:e.status?e.message:'음성 연결을 처리하지 못했어요.'},e.status||500);}}return response;}
 async command(action,actor,b,roomId) {
  const d=this.data;
  if(action==='create') {
   if(d.config){if(d.config.host_id===actor.id&&!d.config.closed)return {room:d.config};fault(409,'이미 사용 중인 방이에요.');}
   let settings;try{settings=roomSettings(b,actor);}catch(e){fault(400,e.message);}
   const config={...settings,id:identifier(roomId),host_id:actor.id,...(b.theme_sku?{theme_sku:b.theme_sku}:{}),created:Date.now(),closed:false,mic_seats:8};
   await this.env.ROOM_DB.prepare('INSERT INTO voice_rooms(id,title,host_id,visibility,crew_id,created,max_members,background,announcement) VALUES(?,?,?,?,?,?,?,?,?)').bind(config.id,config.title,actor.id,config.visibility,config.crew_id,config.created,config.max_members,config.background,config.announcement).run();d.config=config;
   // Creation includes the host's listener membership; there is no empty room between create and navigation.
   await this.command('join',actor,{request_id:crypto.randomUUID()},roomId);return {room:config};
  }
  // Internal directory reconciliation also retires empty rooms left by an older release.
  if(action==='directory-card')return talkingDirectoryCard(d,b.members,b.mode);
  if(action==='presence')return {active:!!d.config&&!d.config.closed&&Object.keys(d.members).length>0,host_id:d.config?.host_id,background:d.config?.background,theme_sku:d.config?.theme_sku,settings_revision:d.config?.settings_revision,mode:d.config?.mode,visibility:d.config?.visibility,member_count:Object.keys(d.members).length,host_name:d.members[d.config?.host_id]?.name||''};
  if(action==='leave'&&!d.members[actor.id]){
   // The last host tab can explicitly leave during the network recovery window.
   if(d.config?.host_id===actor.id&&d.hostReconnectUntil>Date.now()&&b.generation&&b.generation===d.hostReconnectGeneration){
    d.hostReconnectUntil=0;delete d.hostReconnectGeneration;
    if(Object.keys(d.members).length)this.electHost(Date.now());else await this.closeRoom();
    d.revision++;await this.save();await this.syncDirectory();this.notify();
   }
   return {ok:true};
  }
  // A deleted account or removed crew membership cannot keep a lease by sending heartbeats.
  try{this.access(actor,action!=='join'&&!!d.members[actor.id]);}catch(e){const old=d.members[actor.id];if(old)await this.remove(old);throw e;}
  if(action==='join') {
   this.limited(actor,'join',10);requestId(b.request_id);
   let p=d.members[actor.id];
   if(p&&p.joinRequest===b.request_id){p.expires=Date.now()+LEASE;return this.snapshot(actor);}
   if(!p&&actor.id!==d.config.host_id&&Object.keys(d.members).length>=(d.config.max_members||30))fault(409,'방이 가득 찼어요. 최대 30명까지 입장할 수 있어요.');
   const old=p; if(old){await this.stopPublish(old);await this.retire(old.sub);}
   p={id:actor.id,profile_id:actor.profile_id,name:actor.name,image_version:actor.image_version||'',joinOrder:old?.joinOrder??old?.chatAfter??d.chatSequence,visibilityRetained:!!old?.visibilityRetained,role:old?.role||(actor.id===d.config.host_id?'host':'listener'),seat:old?.seat??(actor.id===d.config.host_id?Array.from({length:8},(_,i)=>i).find(i=>!Object.values(d.members).some(m=>m.seat===i))??null:null),requested:false,locked:old?.locked||false,muted:true,pub:null,sub:null,generation:crypto.randomUUID(),expires:Date.now()+LEASE,joinRequest:b.request_id,chatAfter:old?.chatAfter??d.chatSequence};
   if(p.role==='host'){d.hostReconnectUntil=0;delete d.hostReconnectGeneration;}d.members[actor.id]=p;if(!old)this.notice(p,p.name+'님이 입장했어요.');d.revision++;this.notify();return this.snapshot(actor);
  }
  const p=this.member(actor,b.generation);
  this.limited(actor,'requests',180);
  if(action==='state'||action==='heartbeat') {p.expires=Date.now()+LEASE;return this.snapshot(actor);}
  if(action==='socket') {
   const pair=new WebSocketPair();for(const ws of this.ctx.getWebSockets?.()||[]){const a=ws.deserializeAttachment();if(a.id===actor.id)ws.close(4000,'Connection replaced');}
   this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({id:actor.id,generation:p.generation});return new Response(null,{status:101,webSocket:pair[0]});
  }
  if(action==='leave') {await this.remove(p);return {ok:true};}
  if(action==='close') {
   this.moderator(actor);
   await this.closeRoom();
   for(const member of Object.values(d.members))await this.remove(member);await this.audit(actor,'close');return {ok:true};
  }
  if(action==='settings'){
   this.moderator(actor);if(b.revision!==undefined&&b.revision!==(d.config.settings_revision||0))fault(409,'방 설정이 변경됐어요. 다시 열어주세요.');let settings;try{settings=roomSettings(b,actor,d.config);}catch(e){fault(400,e.message);}
   await this.env.ROOM_DB.prepare('UPDATE voice_rooms SET title=?,visibility=?,crew_id=?,max_members=?,background=?,announcement=? WHERE id=?').bind(settings.title,settings.visibility,settings.crew_id,settings.max_members,settings.background,settings.announcement,d.config.id).run();
   if(settings.visibility!==d.config.visibility)for(const member of Object.values(d.members))member.visibilityRetained=true;
   if(settings.seating_mode==='free'&&d.config.seating_mode!=='free')for(const member of Object.values(d.members))this.clearRequest(member);
   Object.assign(d.config,settings,b.theme_sku?{theme_sku:b.theme_sku}:{},{settings_revision:(d.config.settings_revision||0)+1});this.notice(p,'방 설정이 변경됐어요.');await this.audit(actor,'settings');
  }
  else if(action==='seat-invite'){
   this.moderator(actor);const t=d.members[identifier(b.target_id)];if(!t||t.seat!==null)fault(409,'현재 청취 중인 참여자를 선택해주세요.');
   const seat=Number(b.seat);if(!Number.isInteger(seat)||seat<0||seat>7||Object.values(d.members).some(m=>m.seat===seat))fault(409,'빈 좌석을 다시 선택해주세요.');
   d.seatInvites[t.id]={id:crypto.randomUUID(),target:t.id,seat,expires:Date.now()+SEAT_REQUEST_TTL};this.notice(p,t.name+'님에게 좌석 초대를 보냈어요.');
  }
  else if(action==='seat-answer'){
   const invitation=d.seatInvites[p.id];if(p.locked||!invitation||invitation.id!==b.invitation_id||invitation.expires<=Date.now())fault(409,'좌석 초대가 만료됐어요.');
   delete d.seatInvites[p.id];
   if(b.accept===true){if(p.seat!==null||Object.values(d.members).some(m=>m.seat===invitation.seat))fault(409,'이미 사용 중인 좌석이에요.');p.seat=invitation.seat;p.muted=true;p.requested=false;p.locked=false;this.notice(p,p.name+'님이 좌석 초대를 수락했어요.');}
   else this.notice(p,p.name+'님이 좌석 초대를 거절했어요.');
  }
  else if(action==='self-mute'){
   if(typeof b.muted!=='boolean'||!p.pub?.ready||p.locked||p.seat===null)fault(409,'마이크 연결을 다시 시작해주세요.');
   if(b.sequence!==undefined){if(!Number.isSafeInteger(b.sequence)||b.sequence<0)fault(400,'마이크 상태 번호를 확인해주세요.');if(b.sequence<=(p.micSequence??-1))return this.snapshot(actor);p.micSequence=b.sequence;}
   if(p.muted===b.muted)return this.snapshot(actor);p.muted=b.muted;
  }
  else if(action==='request-mic') {
   this.limited(actor,'mic',10);if(p.requested)return this.snapshot(actor);if(p.locked)fault(403,'관리자가 마이크 사용을 제한했어요.');

   if(!d.members[d.config.host_id]||d.members[d.config.host_id].expires<=Date.now())fault(409,'방장이 다시 연결된 뒤 신청해주세요.');
   const seat=b.seat??Array.from({length:8},(_,i)=>i).find(i=>!Object.values(d.members).some(m=>m.seat===i));
   if(!Number.isInteger(seat)||seat<0||seat>7||Object.values(d.members).some(m=>m.seat===seat))fault(409,'빈 좌석을 선택해주세요.');
   if(d.config.seating_mode==='free'||p.seat!==null||p.role==='host'){if(p.seat===null)p.muted=true;p.seat=seat;this.clearRequest(p);delete d.seatInvites[p.id];this.notice(p,p.name+'님이 '+(seat+1)+'번 좌석에 올라왔어요.');await this.audit(actor,'free-seat',p.id);}
   else {p.requested=true;p.requestedSeat=seat;p.requestVersion=d.revision+1;p.requestExpires=Date.now()+SEAT_REQUEST_TTL;}
  }
  else if(action==='cancel-mic'){this.checkSeatRequest(p,b);if(!p.requested)return this.snapshot(actor);this.clearRequest(p);}
  else if(action==='reject-mic'){this.moderator(actor);const t=d.members[identifier(b.target_id)];if(!t)fault(404,'회원이 나갔어요.');this.checkSeatRequest(t,b);this.clearRequest(t);await this.audit(actor,'reject-mic',t.id);}
  else if(action==='approve-mic') {
   this.moderator(actor);const t=d.members[identifier(b.target_id)];if(!t)fault(404,'회원이 나갔어요.');
   this.checkSeatRequest(t,b);if(t.seat!==null)return this.snapshot(actor);
   if(t.id===actor.id&&Number.isInteger(b.seat)&&b.seat>=0&&b.seat<8)t.requestedSeat=b.seat;
   if(!t.requested&&t.id!==actor.id)fault(409,'마이크 신청을 먼저 받아주세요.');
   if(t.seat===null){const used=new Set(Object.values(d.members).map(m=>m.seat));if(Number.isInteger(t.requestedSeat)&&used.has(t.requestedSeat))fault(409,'신청한 좌석이 이미 사용 중이에요. 신청을 취소하고 다른 좌석을 선택해주세요.');const seat=Number.isInteger(t.requestedSeat)?t.requestedSeat:Array.from({length:8},(_,i)=>i).find(i=>!used.has(i));if(seat===undefined)fault(409,'마이크 8석이 모두 사용 중이에요.');t.seat=seat;}
   this.notice(t,t.name+'님이 '+(t.seat+1)+'번 좌석에 올라왔어요.');t.locked=false;this.clearRequest(t);t.muted=true;await this.audit(actor,'approve-mic',t.id);
  }
  else if(action==='release-mic') {if(p.role==='host')fault(403,'방장 좌석은 고정되어 있어요.');if(p.seat===null)return this.snapshot(actor);this.notice(p,p.name+'님이 '+(p.seat+1)+'번 좌석에서 내려왔어요.');await this.stopPublish(p);p.seat=null;this.clearRequest(p);}
  else if(action==='mute') {await this.stopPublish(p);}
  else if(action==='moderate') {
   const t=this.target(actor,b.target_id);if(!['mute','unlock','kick','ban-day','transfer-host','remove-seat','move-seat'].includes(b.operation))fault(400,'관리 작업을 확인해주세요.');

   if(['remove-seat','move-seat'].includes(b.operation)){if(t.seat===null){if(b.operation==='remove-seat')return this.snapshot(actor);fault(409,'이미 청취 중이에요.');}if(b.operation==='remove-seat'){await this.stopPublish(t);t.seat=null;this.clearRequest(t);}else{const seat=Number(b.seat);if(!Number.isInteger(seat)||seat<0||seat>7||Object.values(d.members).some(m=>m.seat===seat))fault(409,'빈 좌석을 선택해주세요.');t.seat=seat;}this.notice(t,t.name+'님의 좌석이 변경됐어요.');}
   if(b.operation==='mute'){t.locked=true;this.clearRequest(t);delete d.seatInvites[t.id];await this.stopPublish(t);}
   if(b.operation==='unlock')t.locked=false;
   if(b.operation==='transfer-host'){this.electHost(Date.now(),t);await this.syncDirectory();}
   if(['kick','ban-day'].includes(b.operation)){d.bans[t.id]=Date.now()+(b.operation==='kick'?60000:86400000);await this.remove(t);}

   if(!['remove-seat','move-seat','transfer-host'].includes(b.operation))this.notice(t,t.name+'님: '+({mute:'마이크 사용 제한',unlock:'마이크 제한 해제',kick:'강퇴','ban-day':'1일 추방'}[b.operation]));await this.audit(actor,b.operation,t.id);
  }
  else if(action==='chat') {
   this.limited(actor,'chat',20);const rid=requestId(b.request_id),body=text(b.body,500),old=d.chat.find(m=>m.request_id===rid&&m.user_id===actor.id);
   if(old){if(old.body!==body)fault(409,'이미 사용한 메시지 요청이에요.');return {message:old};}
   const message={id:crypto.randomUUID(),request_id:rid,user_id:actor.id,name:p.name,profile_id:p.profile_id,image_version:p.image_version,body,created:Date.now(),sequence:++d.chatSequence};d.chat.push(message);d.chat=d.chat.slice(-100);d.revision++;this.notify();return {message};
  }
  else if(action==='invite') {
   this.limited(actor,'invite',10);if(d.config.visibility==='private')this.moderator(actor);
   const id=identifier(b.target_id);if((b.target_blocks||[]).some(uid=>d.members[uid])||
      (d.config.visibility==='followers'&&id!==d.config.host_id&&!(b.target_followed_hosts||[]).includes(d.config.host_id)))fault(403,'이 방에 입장할 수 없는 참여자예요.');
   if(!d.members[id]&&Object.keys(d.members).length>=(d.config.max_members||30))fault(409,'방이 가득 찼어요.');
   if(d.config.visibility==='crew'&&!(b.target_crews||[]).includes(d.config.crew_id))fault(403,'같은 크루 멤버만 초대할 수 있어요.');
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
  else if(action==='music') {
   this.moderator(actor);if(d.config.mode!=='karaoke'&&['volume','balance'].includes(b.operation))fault(400,'음악 볼륨은 내 기기에서 조절해주세요.');this.limited(actor,'music',90);
   const rid=requestId(b.request_id),fingerprint=JSON.stringify(b);const prior=d.musicRequests.find(r=>r.id===rid);if(prior){if(prior.fingerprint!==fingerprint)fault(409,'이미 사용한 음악 요청이에요.');return this.snapshot(actor);}
   const track=b.track;if(b.operation==='enqueue'&&(!track||typeof track.id!=='string'||!Number.isFinite(track.duration)||track.duration<=0||typeof track.title!=='string'))fault(400,'서버가 확인한 곡이 필요해요.');
   try{d.music=changeRoomMusic(d.music,b,track);}catch(e){fault(400,e.message);}d.musicRequests.push({id:rid,fingerprint});d.musicRequests=d.musicRequests.slice(-100);
  }
  else if(action==='published'){if(p.seat===null||p.locked||!p.pub||(!p.pub.ready&&(!p.pub.negotiated||p.pub.deadline<Date.now())))fault(409,'마이크 연결을 다시 시작해주세요.');if(p.pub.ready)return this.snapshot(actor);p.pub.ready=true;p.pub.deadline=0;p.muted=b.muted===true;p.micSequence=-1;}
  else fault(404,'지원하지 않는 토킹룸 요청이에요.');
  d.revision++;this.notify(action==='music'?{type:'music',music:d.music,revision:d.revision,serverNow:Date.now()}:{type:'changed'},(['request-mic','cancel-mic','reject-mic'].includes(action)&&!(action==='request-mic'&&d.config.seating_mode==='free'))?[d.config.host_id,b.target_id||p.id]:null);return this.snapshot(actor);
 }
 async prepareMedia(action,actor,b){
  // Reserve inside the room lock, perform SFU I/O outside it, then commit only
  // against the same membership generation and reservation. Chat stays live.
  this.access(actor,!!this.data.members[actor.id]);const p=this.member(actor,b.generation);this.limited(actor,'media',60);p.expires=Date.now()+LEASE;
  const trace=b.request_id?requestId(b.request_id):crypto.randomUUID(),started=Date.now();const generation=p.generation,valid=media=>this.data.config&&!this.data.config.closed&&this.data.members[p.id]?.generation===generation&&this.data.members[p.id][media.kind==='publish'?'pub':'sub']===media;
  const discard=async(media,error)=>{console.warn(JSON.stringify({event:'voice_media_failed',trace,operation:action,status:error?.status||500,elapsed_ms:Date.now()-started}));await this.serial(async()=>{if(error?.sfuUncertain)media.uncertain=true;if(valid(media)){p[media.kind==='publish'?'pub':'sub']=null;if(media.kind==='publish')p.muted=true;}await this.retire(media);await this.save();});throw error;};
  if(action==='publish'){
   if(p.seat===null||p.locked)fault(403,'승인된 마이크 좌석이 필요해요.');
   if(this.data.cleanup.some(c=>c.owner===p.id&&c.kind!=='subscribe'))fault(409,'이전 송출 연결을 정리하고 있어요. 잠시 후 다시 켜주세요.');
   if(p.pub)fault(409,'이미 연결 중인 마이크예요.');
   const mid=identifier(b.mid),offer=audioOffer(b.sessionDescription,mid),media=p.pub={owner:p.id,kind:'publish',mids:[mid],trackName:'mic-'+crypto.randomUUID(),ready:false,negotiated:false,uncertain:true,expected:1,deadline:Date.now()+35000};
   return async()=>{try{
    media.sessionId=await this.sfu.create();await this.serial(async()=>{await this.save();if(!valid(media)||p.locked||p.seat===null)fault(409,'마이크 연결이 변경됐어요.');});
    const r=await this.sfu.tracks(media.sessionId,{sessionDescription:offer,tracks:[{location:'local',mid,trackName:media.trackName}]});
    return await this.serial(async()=>{media.uncertain=false;media.mids=[...new Set([mid,...(r.tracks||[]).map(t=>t.mid).filter(Boolean)])];if(!valid(media)||p.locked||p.seat===null)fault(409,'마이크 연결이 변경됐어요.');if(!r.sessionDescription||r.tracks?.some(t=>t.errorCode)||r.requiresImmediateRenegotiation)fault(502,'마이크 협상을 다시 시작해주세요.');console.info(JSON.stringify({event:'voice_publish_negotiated',trace,elapsed_ms:Date.now()-started}));media.negotiated=true;media.deadline=Date.now()+30000;await this.save();return {sessionDescription:r.sessionDescription,trace_id:trace};});
   }catch(e){return discard(media,e);}};
  }
  if(action==='subscribe'){
   const targets=Object.values(this.data.members).filter(m=>m.id!==p.id&&m.pub?.ready&&m.expires>Date.now()).map(m=>({id:m.id,sessionId:m.pub.sessionId,trackName:m.pub.trackName}));
   const previous=p.sub;p.sub=null;await this.retire(previous);if(!targets.length)return async()=>({tracks:[]});
   const sub=p.sub={owner:p.id,kind:'subscribe',mids:[],negotiation:crypto.randomUUID(),uncertain:true,expected:targets.length,deadline:Date.now()+35000};
   return async()=>{try{
    sub.sessionId=await this.sfu.create();await this.serial(async()=>{await this.save();if(!valid(sub))fault(409,'수신 연결이 변경됐어요.');});
    const r=await this.sfu.tracks(sub.sessionId,{tracks:targets.map(t=>({location:'remote',sessionId:t.sessionId,trackName:t.trackName}))});
    return await this.serial(async()=>{sub.uncertain=false;sub.mids=(r.tracks||[]).map(t=>t.mid).filter(Boolean);if(!valid(sub))fault(409,'수신 연결이 변경됐어요.');if(!r.sessionDescription||r.tracks?.some(t=>t.errorCode)||sub.mids.length!==targets.length||r.tracks.some(t=>!targets.some(m=>m.trackName===t.trackName)))fault(502,'음성 수신 협상을 다시 시작해주세요.');sub.deadline=Date.now()+30000;await this.save();return {sessionDescription:r.sessionDescription,negotiation:sub.negotiation,tracks:r.tracks.map(t=>({mid:t.mid,user_id:targets.find(m=>m.trackName===t.trackName)?.id})),generation};});
   }catch(e){return discard(sub,e);}};
  }
  const sub=p.sub;if(!sub||sub.negotiation!==b.negotiation||!sub.deadline||sub.deadline<Date.now()||sub.answering)fault(409,'음성 협상 시간이 만료되었어요.');
  const description=audioAnswer(b.sessionDescription,sub.mids);sub.answering=true;
  return async()=>{try{await this.sfu.answer(sub.sessionId,description);return await this.serial(async()=>{if(!valid(sub))fault(409,'수신 연결이 변경됐어요.');sub.deadline=0;sub.answering=false;await this.save();return {ok:true};});}catch(e){return discard(sub,e);}};
 }
 webSocketMessage(ws) {ws.close(1008,'Use authenticated HTTP commands');}
 webSocketClose(ws) {
  // A replacement socket must not clear the new host session's requests.
  const work=this.serial(async()=>{await this.load();const a=ws.deserializeAttachment(),p=this.data.members[a.id];if(p?.role==='host'&&p.generation===a.generation&&!this.ctx.getWebSockets().some(other=>other!==ws&&other.readyState===1&&other.deserializeAttachment().id===p.id)){this.clearRequests();await this.save();}});this.ctx.waitUntil?.(work);work.catch(()=>{});
 }
 webSocketError() {}
}
