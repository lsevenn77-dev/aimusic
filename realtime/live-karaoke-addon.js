// Production add-on: extends the 2026-10-26 voice worker without replacing its modern room logic.
// This source is appended to the exact, archived operational worker bundle.
const baseRoomSettings=roomSettings;
roomSettings=function(input,actor,previous={}){
 const s=baseRoomSettings(input,actor,previous),existing=!!previous.id;
 const mode=existing?(previous.mode||'talk'):(input.mode||'talk');
 if(!['talk','karaoke'].includes(mode)||(existing&&input.mode&&input.mode!==mode))fault(400,'방 유형은 변경할 수 없어요.');
 return {...s,mode};
};
const LIVE_INVITE_MS=10000;
const liveEmpty=()=>({queue:[],active:null,phase:'idle',startsAt:0,inviteExpiresAt:0,revision:0});
const liveHas=(d,id)=>!!d.members[id]&&d.members[id].expires>Date.now();
async function liveStopSinger(room){
 const k=room.data.karaoke;
 if(!k?.active)return;
 const member=room.data.members[k.active.user_id];
 if(member){await room.stopPublish(member);if(member.role!=='host')member.seat=null;}
 k.active=null;k.phase='idle';k.startsAt=0;k.inviteExpiresAt=0;k.revision++;
}
function liveNext(room,allowEmpty=false){
 const {karaoke:k,members}=room.data;
 while(k.queue.length){
  const next=k.queue.shift(),member=members[next.user_id];
  if(!liveHas(room.data,next.user_id)||member.locked)continue;
  k.active={user_id:member.id,name:member.name,track:next.track,invitation_id:next.request_id};
  k.phase='invited';k.startsAt=0;k.inviteExpiresAt=Date.now()+LIVE_INVITE_MS;k.revision++;
  if(member.role!=='host')member.seat=1;
  member.muted=true;
  room.notice(member,member.name+'님 차례예요. 10초 안에 부르기를 눌러주세요.');
  return;
 }
 if(!allowEmpty)fault(409,'노래 신청 대기열이 비어 있어요.');
}
async function liveCommand(room,actor,b){
 const d=room.data,k=d.karaoke;
 room.access(actor,!!d.members[actor.id]);
 const p=room.member(actor,b.generation),isHost=p.role==='host';
 room.limited(actor,'live-karaoke',75);
 switch(b.operation){
  case 'request': {
   const rid=requestId(b.request_id),t=b.track;
   if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>150||typeof t.artist!=='string'||t.artist.length>150||!Number.isFinite(t.duration)||t.duration<=0||t.duration>600)fault(400,'사용할 수 있는 노래방 곡인지 확인해주세요.');
   if(p.locked)fault(403,'마이크 사용이 제한되어 있어요.');
   if(k.active?.user_id===p.id)fault(409,'현재 가창자는 다시 신청할 수 없어요.');
   const prior=k.queue.find(x=>x.user_id===p.id);
   if(prior){if(prior.request_id===rid&&prior.track.id===t.id)return room.snapshot(actor);fault(409,'이미 신청한 곡이 있어요.');}
   if(k.queue.length>=20)fault(409,'신청 대기열은 최대 20곡이에요.');
   k.queue.push({user_id:p.id,name:p.name,request_id:rid,track:t});k.revision++;
   room.notice(p,p.name+'님이 '+t.title+' 노래를 신청했어요.');
   break;
  }
  case 'cancel': {
   const target=b.target_id?identifier(b.target_id):p.id;
   if(target!==p.id&&!isHost)fault(403,'다른 사람의 신청은 취소할 수 없어요.');
   const before=k.queue.length;k.queue=k.queue.filter(x=>x.user_id!==target);
   if(k.queue.length===before)fault(404,'신청을 찾을 수 없어요.');
   k.revision++;break;
  }
  case 'call':
   if(!isHost)fault(403,'방장만 다음 가창자를 부를 수 있어요.');
   if(k.active)fault(409,'현재 가창자가 노래를 마친 뒤 진행해주세요.');
   liveNext(room);break;
  case 'accept': {
   if(!k.active||k.active.user_id!==p.id)fault(403,'호출된 본인만 부르기를 누를 수 있어요.');
   if(!b.invitation_id||b.invitation_id!==k.active.invitation_id)fault(409,'노래 순서가 변경됐어요. 현재 차례를 확인해주세요.');
   if(k.phase==='ready')return room.snapshot(actor); // A retry must not restart the invitation timer.
   if(k.phase!=='invited'||Date.now()>=k.inviteExpiresAt)fault(409,'응답 시간이 지났어요. 다시 예약해주세요.');
   k.phase='ready';k.inviteExpiresAt=0;k.revision++;
   break;
  }
  case 'start':{
   if(!k.active||k.phase!=='ready')fault(409,'가창자를 먼저 불러주세요.');
   if(!isHost&&k.active.user_id!==p.id)fault(403,'방장 또는 가창자만 시작할 수 있어요.');
   if(b.invitation_id&&b.invitation_id!==k.active.invitation_id)fault(409,'노래 순서가 변경됐어요. 현재 차례를 확인해주세요.');
   const singer=d.members[k.active.user_id];
   if(!singer||singer.expires<=Date.now()||!singer.pub?.ready||singer.muted)fault(409,'가창자가 마이크를 켜야 시작할 수 있어요.');
   k.phase='singing';k.startsAt=Date.now()+3000;k.revision++;
   room.notice(singer,'3초 뒤 '+k.active.track.title+' 시작!');
   break;
  }
  case 'finish':case 'next': {
   if(b.operation==='next'&&!isHost)fault(403,'방장만 다음 순서를 진행할 수 있어요.');
   if(!isHost&&k.active?.user_id!==p.id)fault(403,'방장 또는 가창자만 종료할 수 있어요.');
   if(k.active)await liveStopSinger(room);
   if(b.operation==='next'&&k.queue.some(x=>liveHas(d,x.user_id)&&!d.members[x.user_id].locked))liveNext(room);
   break;
  }
  default:fault(400,'노래방 명령을 확인해주세요.');
 }
 d.revision++;room.notify();return room.snapshot(actor);
}
const originalLoad=VoiceRoom.prototype.load;
VoiceRoom.prototype.load=async function(...a){await originalLoad.apply(this,a);this.data.karaoke||=liveEmpty();};
// The base room's 15-second housekeeping alarm is too late for a 10-second
// invitation. Persist the absolute deadline, including across DO restarts.
const originalLiveSave=VoiceRoom.prototype.save;
VoiceRoom.prototype.save=async function(...a){
 await originalLiveSave.apply(this,a);
 const k=this.data?.karaoke;
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='invited'){
  await this.ctx.storage.setAlarm(Math.max(Date.now()+1,k.inviteExpiresAt));
 }
};
const originalSnapshot=VoiceRoom.prototype.snapshot;
VoiceRoom.prototype.snapshot=function(actor){
 const state=originalSnapshot.call(this,actor);
 return {...state,karaoke:this.data.config?.mode==='karaoke'?this.data.karaoke:null};
};
const originalCloseRoom=VoiceRoom.prototype.closeRoom;
VoiceRoom.prototype.closeRoom=async function(...a){
 if(this.data?.karaoke)this.data.karaoke=liveEmpty();
 return originalCloseRoom.apply(this,a);
};
const originalRemove=VoiceRoom.prototype.remove;
VoiceRoom.prototype.remove=async function(p,...args){
 const wasActive=this.data.config?.mode==='karaoke'&&this.data.karaoke.active?.user_id===p.id;
 if(this.data.config?.mode==='karaoke'){
  this.data.karaoke.queue=this.data.karaoke.queue.filter(x=>x.user_id!==p.id);
  if(this.data.karaoke.active?.user_id===p.id)await liveStopSinger(this);
 }
 const result=await originalRemove.call(this,p,...args);
 if(wasActive&&!this.data.config.closed)liveNext(this,true);
 return result;
};
const originalExpire=VoiceRoom.prototype.expire;
VoiceRoom.prototype.expire=async function(...a){
 await originalExpire.apply(this,a);
 const k=this.data?.karaoke;
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='invited'&&Date.now()>=k.inviteExpiresAt){
  const member=this.data.members[k.active.user_id];
  if(member)this.notice(member,member.name+'님이 응답하지 않아 다음 예약자로 넘어가요.');
  await liveStopSinger(this);liveNext(this,true);this.data.revision++;this.notify();
 }
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='singing'&&Date.now()>=k.startsAt+(k.active.track.duration+3)*1000){
  await liveStopSinger(this);this.data.revision++;this.notify();
 }
};
const originalCommand=VoiceRoom.prototype.command;
VoiceRoom.prototype.command=async function(action,actor,b={},roomId){
 if(action==='presence'){const result=await originalCommand.call(this,action,actor,b,roomId);return {...result,mode:this.data.config?.mode||'talk'};}
 if(action==='karaoke'){if(this.data.config?.mode!=='karaoke')fault(409,'라이브 노래방에서만 가능한 명령이에요.');return liveCommand(this,actor,b);}
 if(this.data.config?.mode==='karaoke'&&action!=='create'){
  if(['seat-invite','seat-answer','request-mic','cancel-mic','reject-mic','approve-mic','release-mic','music'].includes(action))fault(409,'라이브 노래방은 한 명씩 노래해요.');
  if(action==='moderate'&&['remove-seat','move-seat'].includes(b.operation))fault(409,'노래방 순서에서 관리해주세요.');
  const canSing=this.data.karaoke.active?.user_id===actor.id&&['ready','singing'].includes(this.data.karaoke.phase);
  if(action==='published'&&!canSing)fault(403,'부르기를 수락한 가창자만 송출할 수 있어요.');
  if(action==='self-mute'&&b.muted===false&&!canSing)fault(403,'부르기를 수락한 가창자만 마이크를 켤 수 있어요.');
 }
 return originalCommand.call(this,action,actor,b,roomId);
};
const originalPrepareMedia=VoiceRoom.prototype.prepareMedia;
VoiceRoom.prototype.prepareMedia=function(action,actor,b,...rest){
 if(action==='publish'&&this.data.config?.mode==='karaoke'&&(this.data.karaoke.active?.user_id!==actor.id||!['ready','singing'].includes(this.data.karaoke.phase)))fault(403,'부르기를 수락한 가창자만 마이크를 송출할 수 있어요.');
 return originalPrepareMedia.call(this,action,actor,b,...rest);
};
