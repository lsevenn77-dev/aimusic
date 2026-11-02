import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {VoiceRoom} from '../realtime/room.js';
import {VoiceRoom as KaraokeRoom} from '../realtime/worker-live-karaoke.js';
import {signedHeaders,verifyRequest,audioOffer,audioAnswer} from '../realtime/protocol.js';
import voiceWorker from '../realtime/worker.js';
import {fixture} from './fixture.mjs';
import {voiceRoomsRoute} from '../server/voice-rooms.js';
import {hash} from '../server/auth.js';
import {Sfu} from '../realtime/sfu.js';
import vm from 'node:vm';
import siteWorker from '../server/index.js';
import * as AifectGifts from '../shared/gifts.js';
const secret='test-only-bridge-secret-not-production-0001';
const actor=(id,crews=[])=>({id,name:id,profile_id:id+'-profile',crews});
const offer={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=sendonly\r\n'};
function harness(t,Room=VoiceRoom) {
 const sql=new DatabaseSync(':memory:');for(const migration of ['0001_rooms.sql','0002_room_settings.sql'])sql.exec(readFileSync(new URL('../realtime/migrations/'+migration,import.meta.url),'utf8'));t.after(()=>sql.close());
 const env={ROOM_DB:{prepare(q){return {bind(...args){const s=sql.prepare(q);return {async run(){s.run(...args);},async all(){return {results:s.all(...args)};}};}};}}};
 const saved=new Map(),events=[];
 const ctx={storage:{async get(k){return structuredClone(saved.get(k));},async put(k,v){saved.set(k,structuredClone(v));},async setAlarm(t){ctx.alarm=t;}},getWebSockets:()=>[]};
 const room=new Room(ctx,env);let next=0,failClose=false,failTracks=false;const closes=[],calls=[];
 room.sfu={async create(){return 'session-'+(++next);},async tracks(id,b){calls.push({id,b});if(failTracks)throw Error('timeout');return {sessionDescription:{type:b.sessionDescription?'answer':'offer',sdp:'test'},tracks:b.tracks.map((x,i)=>({...x,mid:String(i)})),requiresImmediateRenegotiation:!b.sessionDescription};},async answer(id,b){calls.push({id,answer:b});},async close(id,mids){closes.push(id);if(failClose)throw Error('upstream down');}};
 room.notify=e=>events.push(e);
 const call=async(action,a=actor('host'),input={},stamp={nonce:crypto.randomUUID(),timestamp:Date.now()})=>{const r=await room.fetch(new Request('https://room/'+action,{method:'POST',body:JSON.stringify({roomId:'test-room',actor:a,input,stamp})}));return {status:r.status,body:await r.json()};};
 const join=a=>call('join',a,{request_id:crypto.randomUUID()});
 const create=async(visibility='public',crew_id)=>{assert.equal((await call('create',actor('host',crew_id?[crew_id]:[]),{title:'Music together',visibility,crew_id})).status,200);return join(actor('host',crew_id?[crew_id]:[]));};
 return {room,env,call,join,create,sql,closes,calls,events,ctx,saved,setFailClose:v=>failClose=v,setFailTracks:v=>failTracks=v};
}

test('new listeners cannot read earlier chat; reconnect preserves only their admission window',async t=>{
 const h=harness(t);await h.create();
 const chat=body=>h.call('chat',actor('host'),{body,request_id:crypto.randomUUID()});
 await chat('before entry');const joined=await h.join(actor('guest'));
 assert.deepEqual(joined.body.chat,[]);
 await chat('after entry');
 assert.deepEqual((await h.call('heartbeat',actor('guest'))).body.chat.map(m=>m.body),['after entry']);
 assert.deepEqual((await h.call('state',actor('guest'))).body.chat.map(m=>m.body),['after entry']);
 assert.deepEqual((await h.join(actor('guest'))).body.chat.map(m=>m.body),['after entry']);
 await h.call('leave',actor('guest'));await chat('while away');
 assert.deepEqual((await h.join(actor('guest'))).body.chat,[]);
 await chat('after re-entry');
 assert.deepEqual((await h.call('heartbeat',actor('guest'))).body.chat.map(m=>m.body),['after re-entry']);
 assert.equal((await h.call('state',actor('outsider'))).status,403);
});

test('creation reserves host presence; only the final departure closes the room and clears chat',async t=>{
 const h=harness(t);const created=await h.call('create',actor('host'),{title:'A talking room',visibility:'public'});
 assert.equal(created.status,200);assert.equal(Object.keys(h.room.data.members).length,1);
 await h.join(actor('guest'));await h.call('chat',actor('host'),{body:'temporary conversation',request_id:crypto.randomUUID()});
 await h.call('leave',actor('host'));assert.equal(h.room.data.config.closed,false);
 assert.equal(h.sql.prepare('SELECT closed FROM voice_rooms').get().closed,0);
 await h.call('leave',actor('guest'));assert.equal(h.room.data.config.closed,true);
 assert.equal(h.sql.prepare('SELECT closed FROM voice_rooms').get().closed,1);
 assert.deepEqual(h.room.data.chat,[]);assert.deepEqual(h.saved.get('room').chat,[]);
 assert.equal((await h.join(actor('late'))).status,404);
 assert.equal((await h.call('create',actor('host'),{title:'retry',visibility:'public'})).status,409);
});

test('abrupt disconnect expiry and legacy empty rooms are removed from directory results',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));
 h.room.data.members.host.expires=0;await h.room.alarm();assert.equal(h.room.data.config.closed,false);
 h.room.data.members.guest.expires=0;await h.room.alarm();assert.equal(h.room.data.config.closed,false);assert.equal((await h.join(actor('host'))).body.members[0].seat,0);await h.call('leave',actor('host'));assert.equal(h.room.data.config.closed,true);
 const legacy=harness(t);await legacy.create();legacy.room.data.members={};await legacy.room.save();
 const path='/rooms/directory/list',body=JSON.stringify({actor:actor('host'),input:{}});
 const response=await voiceWorker.fetch(new Request('https://voice.test'+path,{method:'POST',headers:await signedHeaders(secret,path,body),body}),{...legacy.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:r=>legacy.room.fetch(r)})}});
 assert.equal(response.status,200);assert.deepEqual((await response.json()).rooms,[]);
 assert.equal(legacy.sql.prepare('SELECT closed FROM voice_rooms').get().closed,1);
});

test('room closure remains persisted and retries a failed directory update',async t=>{
 const h=harness(t);await h.create();const prepare=h.env.ROOM_DB.prepare;
 h.env.ROOM_DB.prepare=q=>{if(q.startsWith('UPDATE voice_rooms'))throw Error('D1 unavailable');return prepare(q);};
 assert.equal((await h.call('leave',actor('host'))).status,200);
 assert.equal(h.saved.get('room').config.closed,true);assert.equal(h.saved.get('room').directoryDirty,true);assert.ok(h.ctx.alarm);
 h.env.ROOM_DB.prepare=prepare;await h.room.alarm();assert.equal(h.room.data.directoryDirty,false);
 assert.equal(h.sql.prepare('SELECT closed FROM voice_rooms').get().closed,1);
});

test('chat ordering handles identical timestamps, retention rollover and old persisted rooms safely',async t=>{
 const h=harness(t);await h.create();
 const chat=async body=>{h.room.data.rates={};return h.call('chat',actor('host'),{body,request_id:crypto.randomUUID()});};
 await chat('old');await h.join(actor('guest'));await chat('new');
 h.room.data.chat.forEach(m=>m.created=1234);
 assert.deepEqual((await h.call('state',actor('guest'))).body.chat.map(m=>m.body),['new']);
 for(let i=0;i<101;i++)await chat('line '+i);
 assert.equal((await h.call('state',actor('guest'))).body.chat.length,100);
 const legacy=structuredClone(h.room.data);delete legacy.chatSequence;
 legacy.chat.forEach(m=>delete m.sequence);Object.values(legacy.members).forEach(m=>delete m.chatAfter);
 h.saved.set('room',legacy);h.room.data=null;
 assert.deepEqual((await h.call('state',actor('guest'))).body.chat,[]);
 await chat('after upgrade');assert.deepEqual((await h.call('state',actor('guest'))).body.chat.map(m=>m.body),['after upgrade']);
});

test('room screen joins once automatically, never opens microphone, and offers retry only on failure',async()=>{
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',elements:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector:()=>({})});return elements.get(id);};
 let calls=0,reply,fail=false,mics=0;
 const c=vm.createContext({performance,crypto,AbortSignal,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},navigator:{mediaDevices:{getUserMedia(){mics++;throw Error('must stay muted');}}},fetch:async()=>{calls++;return new Promise(resolve=>{reply=()=>resolve(Response.json(fail?{error:'full'}:{generation:'g',members:[],room:{}},{status:fail?409:200}));});},audio:{pause(){}},api:()=>Promise.resolve({conversations:[]}),toast(){},busyForm:()=>()=>{},setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,$:get});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\nthis.Client=VoiceRoomClient;',c);
 const setup=()=>{const client=new c.Client('test');client.bindFinalControls=()=>{};client.giftSummary=()=>{};client.paint=()=>{};client.socket=()=>{};client.receive=async()=>{};const original=client.join.bind(client);client.join=()=>client.pending=original();return client;};
 const host={isConnected:true,querySelector:()=>({})},client=setup();client.bindFinalControls=()=>{};client.bind(host);client.bindFinalControls=()=>{};client.bind(host);assert.equal(calls,1);assert.equal(get('#voice-entry').hidden,true);reply();await client.pending;
 assert.equal(client.joined,true);client.bindFinalControls=()=>{};client.bind(host);assert.equal(calls,1);assert.equal(mics,0);assert.equal(get('#voice-music-volume').attributes['aria-valuetext'],'100%');client.leave(false);
 const retry=setup();fail=true;retry.bind(host);reply();await assert.rejects(retry.pending);assert.equal(get('#voice-entry').hidden,false);assert.equal(retry.joined,false);
 fail=false;get('#voice-join').onclick();reply();await retry.pending;assert.equal(retry.joined,true);assert.equal(get('#voice-entry').hidden,true);assert.equal(mics,0);retry.leave(false);
});
test('room gift entry uses the shared dialog and keeps delivery bound to current room members and generation',async()=>{
 const elements=new Map([
  ['#voice-gift-form',{elements:{gift_type:{value:'balloon'},quantity:{value:'3'}}}],
  ['#voice-gift-target',{value:'outside-profile'}],
  ['#voice-gift-sheet',{close(){}}]
 ]),requests=[],dialogs=[],sheets=[];
 const receipt={gift:{id:'receipt-room',type:'balloon',name:'풍선',gold:15,quantity:3},balance:85,animation_pending:true};
 let response=receipt,status=201;
 const c=vm.createContext({crypto,AifectGifts,window:{addEventListener(){}},document:{addEventListener(){}},$:id=>elements.get(id),profileGiftDialog:(id,initial)=>dialogs.push({id,initial}),fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json(response,{status});}});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\nthis.Client=VoiceRoomClient;',c);
 const client=new c.Client('test-room'),self={id:'self',profile_id:'self-profile',name:'Self'},guest={id:'guest',profile_id:'guest-profile',name:'Guest'},other={id:'other',profile_id:'other-profile',name:'Other'};
 Object.assign(client,{joined:true,generation:'generation-1',host:{isConnected:true},state:{self:'self',members:[self,guest,other,{id:'no-profile',name:'Unavailable'}]}});client.showSheet=id=>sheets.push(id);
 assert.equal(await client.roomUIAction('gift'),true);
 assert.equal(dialogs.length,1);assert.equal(dialogs[0].id,guest.profile_id);assert.equal(dialogs[0].initial.id,'balloon');assert.equal(dialogs[0].initial.quantity,3);
 const roomGift=dialogs[0].initial.roomGift;
 assert.deepEqual(JSON.parse(JSON.stringify(roomGift.recipients)),[{id:guest.profile_id,name:guest.name},{id:other.profile_id,name:other.name}]);
 roomGift.onRecipientChange(other.profile_id);assert.equal(elements.get('#voice-gift-target').value,other.profile_id);
 const payload={profile_id:guest.profile_id,gift_type:'balloon',quantity:3,request_id:crypto.randomUUID()};
 assert.deepEqual(await roomGift.send(payload),receipt);
 assert.deepEqual(requests,[{url:'/api/voice/rooms/test-room/gifts',body:{...payload,generation:'generation-1'}}]);
 response={error:'잔액이 부족해요.'};status=409;await assert.rejects(()=>roomGift.send(payload),{message:response.error,status:409});
 client.generation='generation-2';await assert.rejects(()=>roomGift.send(payload),/입장 정보/);client.generation='generation-1';
 client.state.members=[self,other];await assert.rejects(()=>roomGift.send(payload),/나갔어요/);
 await assert.rejects(()=>roomGift.send({...payload,profile_id:self.profile_id}),/나갔어요/);assert.equal(requests.length,2,'invalid room context must never reach the gift endpoint');
 await client.roomUIAction('gift');assert.equal(dialogs[1].id,other.profile_id,'a selected current member remains selected on reopening');
 client.state.members=[self];await client.roomUIAction('gift');assert.deepEqual(sheets,['voice-gift-sheet']);assert.equal(dialogs.length,2,'an empty room keeps the existing non-sendable state');
 client.joined=false;await assert.rejects(()=>roomGift.send({...payload,profile_id:other.profile_id}),/입장 정보/);assert.equal(requests.length,2);
});
test('bridge signatures bind payload/path/time and reject tampering or expiry',async()=>{
 const body=JSON.stringify({actor:actor('host')}),path='/rooms/test/state',headers=await signedHeaders(secret,path,body,100000,'1234567890abcdef');
 const r=new Request('https://voice.example'+path,{headers});assert.equal((await verifyRequest(r,secret,body,100001)).nonce,'1234567890abcdef');
 await assert.rejects(()=>verifyRequest(r,secret,body+' ',100001),{status:401});await assert.rejects(()=>verifyRequest(r,secret,body,140001),{status:401});
 await assert.rejects(()=>verifyRequest(new Request('https://voice.example/rooms/else/state',{headers}),secret,body,100001),{status:401});
 assert.equal((await voiceWorker.fetch(new Request('https://voice.example/rooms/test/state',{method:'POST',body}),{VOICE_BRIDGE_SECRET:secret})).status,401);
});
test('SFU publication accepts exactly one sendonly audio section',()=>{
 assert.deepEqual(audioOffer(offer,'0'),offer);
 for(const sdp of [offer.sdp+'a=sendrecv\r\n',offer.sdp.replace('sendonly','recvonly'),offer.sdp+'m=video 9 RTP/AVP 96\r\na=mid:1\r\n',offer.sdp+'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'])assert.throws(()=>audioOffer({type:'offer',sdp},'0'),{status:400});
 assert.throws(()=>audioOffer(offer,'1'),{status:400});
 const answer={type:'answer',sdp:offer.sdp.replace('sendonly','recvonly')};assert.deepEqual(audioAnswer(answer,['0']),answer);assert.throws(()=>audioAnswer({...answer,sdp:offer.sdp},['0']),{status:400});assert.throws(()=>audioAnswer(answer,['1']),{status:400});
});
test('concurrent joins enforce 30 participants and duplicate joins do not consume capacity',async t=>{
 const h=harness(t);await h.create();const r=await Promise.all(Array.from({length:35},(_,i)=>h.join(actor('u'+i))));assert.equal(r.filter(r=>r.status===200).length,29);assert.equal(r.filter(r=>r.status===409).length,6);assert.equal(Object.keys(h.room.data.members).length,30);
 assert.equal((await h.join(actor('host'))).status,200);assert.equal(Object.keys(h.room.data.members).length,30);
});
test('8 mic seats, listener permission and moderator hierarchy are enforced on server',async t=>{
 const h=harness(t);await h.create();for(let i=0;i<9;i++){await h.join(actor('u'+i));await h.call('request-mic',actor('u'+i),{seat:Math.min(i+1,7)});}
 assert.equal((await h.call('approve-mic',actor('u0'),{target_id:'u0'})).status,403);assert.equal((await h.call('moderate',actor('host'),{target_id:'constructor',operation:'admin'})).status,400);
 const approvals=await Promise.all(Array.from({length:9},(_,i)=>h.call('approve-mic',actor('host'),{target_id:'u'+i})));assert.equal(approvals.filter(x=>x.status===200).length,7);assert.equal(approvals[8].status,409);
 assert.equal((await h.call('publish',actor('u8'),{mid:'0',sessionDescription:offer})).status,403);
 await h.call('moderate',actor('host'),{target_id:'u0',operation:'admin'});
 assert.equal((await h.call('moderate',actor('u0'),{target_id:'host',operation:'ban'})).status,403);
 assert.equal((await h.call('moderate',actor('u0'),{target_id:'u1',operation:'admin'})).status,403);
});
test('eight simultaneous publishers fan out to thirty members and one speaker mute preserves the other seven',async t=>{
 const h=harness(t);await h.create();const speakers=[actor('host'),...Array.from({length:7},(_,i)=>actor('speaker-'+i))];
 const listeners=Array.from({length:22},(_,i)=>actor('listener-'+i));
 for(const a of [...speakers.slice(1),...listeners])assert.equal((await h.join(a)).status,200);
 for(const a of speakers){await h.call('request-mic',a);assert.equal((await h.call('approve-mic',actor('host'),{target_id:a.id})).status,200);}
 let active=0,peak=0;const originalTracks=h.room.sfu.tracks;
 h.room.sfu.tracks=async(...args)=>{active++;peak=Math.max(peak,active);try{await new Promise(r=>setTimeout(r,15));return await originalTracks(...args);}finally{active--;}};
 const started=performance.now();
 const publications=await Promise.all(speakers.map(a=>h.call('publish',a,{mid:'0',sessionDescription:offer})));
 assert.ok(publications.every(r=>r.status===200));assert.equal(peak,8,'SFU operations must run concurrently outside the room state lock');
 const sessions=speakers.map(a=>h.room.data.members[a.id].pub.sessionId);assert.equal(new Set(sessions).size,8);
 assert.ok((await Promise.all(speakers.map(a=>h.call('published',a)))).every(r=>r.status===200));
 const all=[...speakers,...listeners];
 const pulls=await Promise.all(all.map(a=>h.call('subscribe',a)));
 for(let i=0;i<all.length;i++){
  assert.equal(pulls[i].status,200);const expected=speakers.some(a=>a.id===all[i].id)?7:8;
  assert.equal(pulls[i].body.tracks.length,expected);assert.equal(new Set(pulls[i].body.tracks.map(t=>t.user_id)).size,expected);
  assert.ok(pulls[i].body.tracks.every(t=>t.user_id!==all[i].id));
  const sdp='v=0\r\n'+pulls[i].body.tracks.map(t=>'m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:'+t.mid+'\r\na=recvonly\r\n').join('');
  assert.equal((await h.call('answer',all[i],{negotiation:pulls[i].body.negotiation,sessionDescription:{type:'answer',sdp}})).status,200);
 }
 assert.equal((await h.call('mute',speakers[0])).status,200);
 for(const a of speakers.slice(1))assert.equal(h.room.data.members[a.id].pub.ready,true);
 const afterMute=await h.call('subscribe',listeners[0]);assert.equal(afterMute.status,200);assert.equal(afterMute.body.tracks.length,7);
 assert.equal((await h.call('chat',listeners[0],{request_id:crypto.randomUUID(),body:'voice fanout remains live'})).status,200);
 t.diagnostic(JSON.stringify({kind:'mock_sfu_state_test_only',publishers:8,members:30,peakConcurrentSfuCalls:peak,elapsedMs:Math.round(performance.now()-started),realAudioMeasured:false}));
});

test('private rooms require recipient invite; crew membership and blocks are rechecked',async t=>{
 const h=harness(t);await h.create('private');assert.equal((await h.join(actor('guest'))).status,403);
 await h.call('invite',actor('host'),{target_id:'guest'});assert.equal((await h.join(actor('guest'))).status,200);
 assert.equal((await h.call('invite',actor('guest'),{target_id:'third'})).status,403);
 const c=harness(t);await c.create('crew','crew-one');assert.equal((await c.join(actor('guest'))).status,403);await c.join(actor('guest',['crew-one']));assert.equal((await c.call('heartbeat',actor('guest'))).status,403);assert.equal(c.room.data.members.guest,undefined);
 const b=harness(t);await b.create();assert.equal((await b.join({...actor('guest'),blocks:['host']})).status,403);
});
test('kick/ban, reconnect generations, lease expiry and replayed server requests',async t=>{
 const h=harness(t);await h.create();const first=await h.join(actor('guest'));await h.join(actor('guest'));assert.equal((await h.call('chat',actor('guest'),{generation:first.body.generation,request_id:crypto.randomUUID(),body:'stale'})).status,409);
 const stamp={nonce:crypto.randomUUID(),timestamp:Date.now()};assert.equal((await h.call('state',actor('host'),{},stamp)).status,200);assert.equal((await h.call('state',actor('host'),{},stamp)).status,409);
 await h.call('moderate',actor('host'),{target_id:'guest',operation:'kick'});assert.equal((await h.join(actor('guest'))).status,403);
 h.room.data.members.host.expires=0;await h.room.alarm();assert.equal(Object.keys(h.room.data.members).length,0);
});
test('server resolves subscriptions; mute closes publisher; failures retain cleanup intent',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));await h.call('approve-mic',actor('host'),{target_id:'host'});
 assert.equal((await h.call('publish',actor('host'),{mid:'0',sessionDescription:offer})).status,200);assert.equal(h.room.data.members.host.pub.ready,false);await h.call('published',actor('host'));assert.equal(h.room.data.members.host.pub.ready,true);
 assert.equal((await h.call('subscribe',actor('guest'),{sessionId:'foreign',tracks:[{sessionId:'stolen',trackName:'secret'}]})).status,200);
 const pull=h.calls.at(-1);assert.equal(pull.b.tracks[0].sessionId,'session-1');assert.match(pull.b.tracks[0].trackName,/^mic-/);
 assert.equal((await h.call('answer',actor('guest'),{negotiation:'forged',sessionDescription:{type:'answer',sdp:'test'}})).status,409);
 h.setFailClose(true);await h.call('mute',actor('host'));assert.equal(h.room.data.members.host.pub,null);assert.ok(h.room.data.cleanup.length);h.setFailClose(false);for(const job of h.room.data.cleanup)job.after=0;await h.room.alarm();assert.equal(h.room.data.cleanup.length,0);
});
test('partial SFU failure cleans session; chat and gift animation deduplicate',async t=>{
 const h=harness(t);await h.create();await h.call('approve-mic',actor('host'),{target_id:'host'});h.setFailTracks(true);
 assert.equal((await h.call('publish',actor('host'),{mid:'0',sessionDescription:offer})).status,500);assert.equal(h.room.data.members.host.pub,null);assert.ok(h.closes.includes('session-1'));
 const message={body:'hello',request_id:crypto.randomUUID()};await h.call('chat',actor('host'),message);await h.call('chat',actor('host'),message);assert.equal(h.room.data.chat.length,1);assert.equal((await h.call('chat',actor('host'),{...message,body:'changed'})).status,409);
 const receipt={id:'receipt-1',gold:5,type:'balloon',name:'풍선',quantity:1};await h.call('gift-receipt',actor('host'),{receipt,target_name:'Guest'});await h.call('gift-receipt',actor('host'),{receipt,target_name:'Guest'});assert.equal(h.events.filter(e=>e?.type==='gift').length,1);
});
test('existing Site API rejects guests and missing setup without affecting catalogue',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/voice/status')).body.enabled,false);assert.equal((await f.call('/api/voice/rooms','GET',null,'')).status,401);assert.equal((await f.call('/api/voice/rooms')).status,503);assert.equal((await f.call('/api/catalog')).status,200);
 const env={DB:f.DB},ctx={waitUntil:p=>p.catch(()=>{})};
 const foreign=new Request('https://aifect.test/api/voice/rooms/test-room/join',{method:'POST',headers:{origin:'https://foreign.test',cookie:'aifect_session=owner'},body:JSON.stringify({request_id:crypto.randomUUID()})});
 assert.equal((await siteWorker.fetch(foreign,env,ctx)).status,403);
 const socket=new Request('https://aifect.test/api/voice/rooms/test-room/socket',{headers:{origin:'https://foreign.test',upgrade:'websocket',cookie:'aifect_session=owner'}});
 assert.equal((await siteWorker.fetch(socket,env,ctx)).status,403);
});

test('gift chat notices are ordered, persisted once and restricted to members present at delivery',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));
 await h.call('chat',actor('guest'),{body:'before gift',request_id:crypto.randomUUID()});
 const receipt={id:'gift-notice-1',gold:3,type:'lollipop',name:'막대사탕',quantity:3};
 const send=()=>h.call('gift-receipt',actor('host'),{receipt,target_name:'Guest'});
 assert.equal((await send()).status,200);
 const notice=h.room.data.chat.at(-1);
 assert.equal(notice.kind,'gift');assert.equal(notice.body,'host님이 Guest님에게 막대사탕 ×3을 보냈습니다.');
 assert.deepEqual(notice.gift,{id:receipt.id,type:'lollipop',name:'막대사탕',quantity:3});
 assert.ok(notice.sequence>h.room.data.chat[0].sequence);
 assert.deepEqual(h.saved.get('room').chat.at(-1),notice);
 assert.deepEqual((await h.call('heartbeat',actor('guest'))).body.chat.map(m=>m.kind||'chat'),['chat','gift']);
 assert.deepEqual((await h.join(actor('late'))).body.chat,[]);
 // Persisted receipt marker prevents duplication even after the DO is recreated.
 h.room.data=null;assert.equal((await send()).status,200);
 assert.equal(h.room.data.chat.filter(m=>m.kind==='gift').length,1);
 assert.equal(h.events.filter(e=>e?.type==='gift').length,1);
 assert.deepEqual((await h.join(actor('guest'))).body.chat.at(-1),notice);
 await h.call('leave',actor('guest'));assert.deepEqual((await h.join(actor('guest'))).body.chat,[]);
 await h.call('chat',actor('host'),{body:'normal message',kind:'gift',gift:receipt,request_id:crypto.randomUUID()});
 assert.equal(h.room.data.chat.at(-1).kind,undefined,'normal chat cannot forge a system gift notice');
 await h.call('close',actor('host'));assert.deepEqual(h.saved.get('room').chat,[]);
});

test('gift websocket event refreshes chat immediately and coalesces updates arriving during a refresh',async()=>{
 class Socket{constructor(){Socket.current=this;}close(){}}
 const c=vm.createContext({performance,crypto,URL,WebSocket:Socket,location:{href:'https://aifect.test/#voice/test'},window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout,setInterval,clearInterval});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\nthis.Client=VoiceRoomClient;',c);
 const client=new c.Client('test');client.joined=true;client.epoch=1;
 const pending=[],painted=[];let animated=0;
 client.command=()=>new Promise(resolve=>pending.push(resolve));client.paint=()=>painted.push(client.state.revision);client.receive=async()=>{};client.animateGift=()=>animated++;client.connectionError=assert.fail;
 client.socket();const socket=Socket.current;
 const first=client.refresh();assert.equal(pending.length,1);
 socket.onmessage({data:JSON.stringify({type:'gift',gift:{id:'receipt'}})});
 socket.onmessage({data:JSON.stringify({type:'changed'})});
 assert.equal(animated,1);assert.equal(pending.length,1);
 pending[0]({revision:1});await first;assert.equal(pending.length,2,'one follow-up replaces the skipped events');
 pending[1]({revision:2});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(painted,[1,2]);assert.equal(client.refreshAgain,false);
 client.closed=true;
});

test('SFU invokes native fetch without binding the Sfu instance as its receiver',async()=>{
 let called=false;
 const sfu=new Sfu({REALTIME_SFU_APP_ID:'test',REALTIME_SFU_APP_SECRET:'test'},async function(url,init){
  assert.equal(this,undefined,'Workers native fetch rejects an unrelated receiver');
  assert.equal(init.method,'POST');assert.ok(url.endsWith('/sessions/new'));called=true;
  return Response.json({sessionId:'valid-session'});
 });
 assert.equal(await sfu.create(),'valid-session');assert.equal(called,true);
});

test('lost SFU responses keep cleanup pending until late allocations are closed',async()=>{
 let tracks=[],sent=[];
 const sfu=new Sfu({REALTIME_SFU_APP_ID:'test',REALTIME_SFU_APP_SECRET:'test'},async(url,init)=>{
  if(init.method==='GET')return Response.json({tracks});
  sent.push(JSON.parse(init.body));return Response.json({tracks:JSON.parse(init.body).tracks});
 });
 const job={uncertain:true,expected:1};
 assert.equal((await sfu.close('session',['0'],job)).resolved,false);
 tracks=[{mid:'0',status:'active'}];
 assert.equal((await sfu.close('session',['0'],job)).resolved,true);
 assert.deepEqual(sent.at(-1),{force:true,tracks:[{mid:'0'}]});
 tracks=[{mid:'0',status:'inactive'}];const before=sent.length;
 assert.equal((await sfu.close('session',['0'],job)).resolved,true);assert.equal(sent.length,before);
 const expired=new Sfu(sfu.env,async()=>Response.json({errorCode:'session_error'},{status:410}));
 assert.equal((await expired.close('session',[],job)).resolved,true);
 const badApp=new Sfu(sfu.env,async()=>Response.json({errorCode:'not_found'},{status:404}));
 await assert.rejects(()=>badApp.close('session',[],job));
});

test('frontend ignores old heartbeat after rejoin and stops a late microphone grant after leaving',async()=>{
 const c=vm.createContext({performance,crypto,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},navigator:{mediaDevices:{}},fetch:async()=>Response.json({}),setInterval,clearInterval,setTimeout,clearTimeout,$:()=>({value:''})});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\nthis.Client=VoiceRoomClient;',c);
 const client=new c.Client('test');client.joined=true;client.epoch=1;client.state={revision:2};let reply;client.command=()=>new Promise(r=>reply=r);client.paint=()=>assert.fail('stale response painted');
 const pending=client.refresh();client.epoch=2;reply({revision:1});await pending;assert.equal(client.state.revision,2);
 let grant,stops=0;c.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>grant=r);client.paint=()=>{};
 const opening=client.enableMic();client.leave(false);grant({getTracks:()=>[{stop:()=>stops++}]});await opening;assert.equal(stops,1);assert.equal(client.stream,undefined);
});
test('voice labels use the public nickname without the crew suffix and preserve crew-only admission',async t=>{
 const name='코코(노래)',crewName='밤산책';
 const h=harness(t),oldActor={...actor('owner',['crew']),name:name+'('+crewName+')',profile_id:'producer'};
 await h.call('create',oldActor,{title:'Crew conversation',visibility:'crew',crew_id:'crew'});
 const f=await fixture(t,{VOICE_SERVICE_URL:'https://voice.test',VOICE_BRIDGE_SECRET:secret});
 f.sql.prepare('UPDATE producers SET name=?,nickname_confirmed=1 WHERE id=?').run(name,'producer');
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','밤산책',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 const actors=[];
 globalThis.fetch=async(url,init)=>{
  const signed=JSON.parse(init.body);actors.push(signed.actor);
  return voiceWorker.fetch(new Request(url,init),{...h.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:r=>h.room.fetch(r)})}});
 };
 const root='/api/voice/rooms/test-room/';
 // A fresh join replaces a persisted label from an older room without losing
 // the original nickname's own parentheses or the host's seat and role.
 const joined=await f.call(root+'join','POST',{request_id:crypto.randomUUID()});
 assert.equal(joined.status,200,JSON.stringify(joined.body));
 assert.equal(actors.at(-1).name,name);assert.deepEqual(actors.at(-1).crews,['crew']);
 const member=joined.body.members.find(p=>p.id==='owner');
 assert.equal(member.name,name);assert.equal(member.role,'host');assert.equal(member.seat,0);
 const chat=await f.call(root+'chat','POST',{generation:joined.body.generation,body:'대화해요',request_id:crypto.randomUUID()});
 assert.equal(chat.status,200);assert.equal(h.room.data.chat.at(-1).name,name);
 const outsider=await f.call(root+'join','POST',{request_id:crypto.randomUUID()},'other');
 assert.equal(outsider.status,403,'hiding the crew label must not remove crew membership authorization');
 assert.equal(Object.keys(h.room.data.members).length,1);
});

test('voice gifts reject silver BEFORE deduction',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0)");
 const user={id:'owner',profile_id:'producer',name:'Owner'},ctx={waitUntil:p=>p.catch(()=>{})};
 const path='/api/voice/rooms/test-room/gifts',base={profile_id:'other-profile',quantity:1,request_id:crypto.randomUUID(),gift_type:'silver-letter'};
 const request=b=>new Request('https://aifect.test'+path,{method:'POST',body:JSON.stringify(b)});
 await assert.rejects(()=>voiceRoomsRoute(request(base),{DB:f.DB},path,user,ctx),{status:400});assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,0);
});
test('voice gift retries debit once and invitations reuse the DM ledger',async t=>{
 const h=harness(t);await h.call('create',actor('owner'),{title:'Gift room',visibility:'public'});await h.join({...actor('owner'),profile_id:'producer'});await h.join(actor('other'));
 const env={VOICE_SERVICE_URL:'https://voice.test',VOICE_BRIDGE_SECRET:secret};const f=await fixture(t,env);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('paid-lot','owner','web',100,1000,30,'paid',1,1)");
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,init)=>{assert.equal(new URL(url).hostname,'voice.test');return voiceWorker.fetch(new Request(url,init),{...h.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:r=>h.room.fetch(r)})}});};
 const rejected={profile_id:'other-profile',gift_type:'crown',quantity:1,request_id:crypto.randomUUID()};
 assert.equal((await f.call('/api/voice/rooms/test-room/gifts','POST',rejected)).status,409);
 assert.equal(h.room.data.chat.length,0,'failed payment does not announce a gift');
 assert.equal((await f.call('/api/voice/rooms/test-room/gift-receipt','POST',{receipt:{id:'fake'}})).status,404,'clients cannot publish receipt events');
 const b={profile_id:'other-profile',gift_type:'lollipop',quantity:3,request_id:crypto.randomUUID()};
 const a=await f.call('/api/voice/rooms/test-room/gifts','POST',b);assert.equal(a.status,201,JSON.stringify(a.body));
 const again=await f.call('/api/voice/rooms/test-room/gifts','POST',b);assert.equal(again.body.gift.id,a.body.gift.id);assert.equal(again.body.balance,97);assert.equal(again.body.gift.name,'막대사탕');assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert.equal(h.events.filter(e=>e?.type==='gift').length,1);
 assert.equal(h.room.data.chat.filter(m=>m.kind==='gift').length,1);
 assert.equal(h.room.data.chat.at(-1).body,'owner님이 Other님에게 막대사탕 ×3을 보냈습니다.');
 assert.equal((await f.call('/api/voice/rooms/test-room/gifts','POST',{...b,quantity:4})).status,409);
 const invite={profile_id:'other-profile',request_id:crypto.randomUUID()};assert.equal((await f.call('/api/voice/rooms/test-room/invite','POST',invite)).status,201);assert.equal((await f.call('/api/voice/rooms/test-room/invite','POST',invite)).status,201);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,1);assert.match(f.sql.prepare('SELECT body FROM direct_messages').get().body,/#voice\/test-room/);
 const list=()=>f.call('/api/notifications?filter=gifts','GET',null,'other');
 let item=(await list()).body.items[0];
 assert.deepEqual([item.source_type,item.source_id,item.gift_source_title,item.href],['talking_room','test-room','Gift room','#voice/test-room']);
 const open=()=>f.call('/api/notifications/'+encodeURIComponent(item.id)+'/open','POST',{},'other');
 assert.equal((await open()).body.href,'#voice/test-room');
 // Simulate an old receipt whose original room event is still visible.
 f.sql.prepare('DELETE FROM gift_sources WHERE gift_id=?').run(a.body.gift.id);
 assert.equal((await list()).body.items[0].source_type,null);
 assert.equal((await f.call('/api/voice/rooms/test-room/gifts','POST',{...b,request_id:crypto.randomUUID()})).status,201);
 assert.equal(f.sql.prepare('SELECT source_type FROM gift_sources WHERE gift_id=?').get(a.body.gift.id).source_type,'talking_room');
 await h.call('close',actor('owner'));
 const closed=(await open()).body;assert.equal(closed.href,'');assert.equal(closed.unavailable_reason,'room');
 const retried=await f.call('/api/voice/rooms/test-room/gifts','POST',b);assert.equal(retried.body.gift.id,a.body.gift.id);
});

test('karaoke gifts use the signed room mode and title and share the list and click destination',async t=>{
 const h=harness(t,KaraokeRoom);await h.call('create',actor('owner'),{title:'라이브 무대',visibility:'public',mode:'karaoke'});await h.join(actor('other'));
 const f=await fixture(t,{VOICE_SERVICE_URL:'https://voice.test',VOICE_BRIDGE_SECRET:secret});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('karaoke-lot','owner','web',100,1000,30,'paid',1,1)");
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
 globalThis.fetch=(url,init)=>voiceWorker.fetch(new Request(url,init),{...h.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:r=>h.room.fetch(r)})}});
 const gift=await f.call('/api/voice/rooms/test-room/gifts','POST',{profile_id:'other-profile',gift_type:'lollipop',request_id:crypto.randomUUID(),source_type:'profile',source_id:'wrong',source_title:'wrong'});
 assert.equal(gift.status,201);
 const item=(await f.call('/api/notifications?filter=gifts','GET',null,'other')).body.items[0];
 assert.deepEqual([item.source_type,item.source_id,item.gift_source_title,item.href],['karaoke','test-room','라이브 무대','#live/test-room']);
 const open=await f.call('/api/notifications/'+encodeURIComponent(item.id)+'/open','POST',{},'other');
 assert.equal(open.body.href,item.href);
});

test('retiring slow SFU sessions does not block chat, heartbeat or receiver-only republishing',async t=>{
 const h=harness(t);await h.create();await h.call('approve-mic',actor('host'),{target_id:'host'});
 let finish;h.room.sfu.close=()=>new Promise(resolve=>finish=resolve);
 h.room.data.members.host.sub={sessionId:'old-receiver',owner:'host',kind:'subscribe',mids:[]};
 const retirement=h.room.retire(h.room.data.members.host.sub);await retirement;h.room.data.members.host.sub=null;
 assert.equal((await h.call('chat',actor('host'),{body:'still responsive',request_id:crypto.randomUUID()})).status,200);
 assert.equal((await h.call('heartbeat')).status,200);
 assert.equal((await h.call('publish',actor('host'),{mid:'0',sessionDescription:offer})).status,200);
 assert.ok(h.room.data.cleanup.some(c=>c.sessionId==='old-receiver'));finish({resolved:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.room.data.cleanup.some(c=>c.sessionId==='old-receiver'),false);
});

test('seat preference, muted admission and ordered realtime notices follow actual server events',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));
 await h.call('request-mic',actor('guest'),{seat:5});await h.call('approve-mic',actor('host'),{target_id:'guest'});
 const member=h.room.data.members.guest;assert.equal(member.seat,5);assert.equal(member.muted,true);assert.equal(member.pub,null);
 await h.call('release-mic',actor('guest'));await h.call('leave',actor('guest'));
 const state=(await h.call('heartbeat')).body;assert.ok(state.notices.some(n=>n.body.includes('입장')));assert.ok(state.notices.some(n=>n.body.includes('6번 좌석에 올라')));assert.ok(state.notices.some(n=>n.body.includes('6번 좌석에서 내려')));assert.ok(state.notices.some(n=>n.body.includes('퇴장')));
 assert.equal(state.members.length,1);assert.equal(state.members[0].id,'host');
});

test('two authenticated members share music state; only host and explicit rights consent permit control',async t=>{
 const h=harness(t);await h.call('create',actor('owner'),{title:'Music',visibility:'public'});await h.join(actor('other'));
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 const bytes=new TextEncoder().encode('audiobytes');
 const f=await fixture(t,{VOICE_SERVICE_URL:'https://voice.test',VOICE_BRIDGE_SECRET:secret,BUCKET:{head:async()=>({size:bytes.length}),get:async()=>({body:bytes})}});
 f.sql.exec('UPDATE tracks SET duration=120');
 globalThis.fetch=async(url,init)=>voiceWorker.fetch(new Request(url,init),{...h.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:r=>h.room.fetch(r)})}});
 const root='/api/voice/rooms/test-room/';const gen=h.room.data.members.owner.generation;
 const initial=await f.call(root+'music-search?q=one&generation='+gen);assert.equal(initial.status,200);assert.equal(initial.body.tracks.find(t=>t.id==='one').room_allowed,false);
 assert.equal((await f.call(root+'music','POST',{operation:'enqueue',track_id:'one',request_id:crypto.randomUUID(),generation:gen})).status,403);
 assert.equal((await f.call(root+'music-consent','POST',{track_id:'one',accept:true,generation:gen})).status,200);
 const command={operation:'enqueue',track_id:'one',request_id:crypto.randomUUID(),generation:gen,track:{id:'forged',duration:1}};
 const first=await f.call(root+'music','POST',command);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.music.queue[0].id,'one');
 assert.equal((await f.call(root+'music','POST',command)).body.music.starts,0);assert.equal(first.body.music.playing,false);
 await f.call(root+'music','POST',{operation:'play',generation:gen,request_id:crypto.randomUUID()});
 const otherGen=h.room.data.members.other.generation;
 assert.equal((await f.call(root+'music','POST',{operation:'pause',request_id:crypto.randomUUID(),generation:otherGen},'other')).status,403);
 const pause=await f.call(root+'music','POST',{operation:'pause',request_id:crypto.randomUUID(),generation:gen});assert.equal(pause.body.music.playing,false);
 const guest=(await h.call('state',actor('other'),{generation:otherGen})).body;assert.deepEqual(guest.music,pause.body.music);
 const stream=new Request('https://aifect.test'+root+'music-stream?track_id=one&generation='+otherGen);
 const response=await voiceRoomsRoute(stream,{DB:f.DB,VOICE_SERVICE_URL:'https://voice.test',VOICE_BRIDGE_SECRET:secret,BUCKET:{head:async()=>({size:bytes.length}),get:async()=>({body:bytes})}},root+'music-stream',{id:'other',name:'Other'},{});
 assert.equal(response.status,200);assert.equal(await response.text(),'audiobytes');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM listens').get().n,0);
 f.sql.exec("DELETE FROM voice_music_permissions WHERE track_id='one'");
 assert.equal((await f.call(root+'music-stream?track_id=one&generation='+otherGen,'GET',null,'other')).status,403);
});

test('a pending publication never holds the room lock and a mute invalidates its late result',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));await h.call('approve-mic',actor('host'),{target_id:'host'});
 let resolveTracks,started;const ready=new Promise(resolve=>started=resolve);
 h.room.sfu.tracks=async(id,b)=>{started();return new Promise(resolve=>resolveTracks=()=>resolve({sessionDescription:{type:'answer',sdp:'test'},tracks:b.tracks}));};
 const pending=h.call('publish',actor('host'),{mid:'0',sessionDescription:offer});await ready;
 assert.equal((await h.call('published')).status,409,'cannot advertise unnegotiated media');
 assert.equal((await h.call('chat',actor('guest'),{body:'while negotiating',request_id:crypto.randomUUID()})).status,200);
 assert.equal((await h.call('heartbeat',actor('guest'))).status,200);
 assert.equal((await h.call('mute')).status,200);resolveTracks();assert.equal((await pending).status,409);
 assert.equal(h.room.data.members.host.pub,null);assert.equal(h.room.data.members.host.muted,true);assert.ok(h.closes.includes('session-1'));
});

test('an old generation cannot replace the new browser websocket or end its microphone',async t=>{
 const h=harness(t);await h.create();const old=h.room.data.members.host.generation;const fresh=(await h.join(actor('host'))).body.generation;
 assert.notEqual(old,fresh);assert.equal((await h.call('socket',actor('host'),{generation:old})).status,409);
 assert.equal((await h.call('mute',actor('host'),{generation:old})).status,409);assert.equal(h.room.data.members.host.generation,fresh);
});

test('seat requests can be cancelled or rejected and an occupied requested seat is never stolen',async t=>{
 const h=harness(t);await h.create();await h.join(actor('a'));await h.join(actor('b'));
 await h.call('request-mic',actor('a'),{seat:3});assert.equal(h.room.data.members.a.requested,true);
 await h.call('cancel-mic',actor('a'));assert.equal(h.room.data.members.a.requested,false);
 await h.call('request-mic',actor('a'),{seat:3});assert.equal((await h.call('reject-mic',actor('b'),{target_id:'a'})).status,403);
 await h.call('reject-mic',actor('host'),{target_id:'a'});assert.equal(h.room.data.members.a.requested,false);
 await h.call('request-mic',actor('a'),{seat:3});await h.call('request-mic',actor('b'),{seat:3});await h.call('approve-mic',actor('host'),{target_id:'a'});
 assert.equal((await h.call('approve-mic',actor('host'),{target_id:'b'})).status,409);assert.equal(h.room.data.members.b.seat,null);assert.equal(h.room.data.members.a.seat,3);
 const notices=h.room.data.notices.length;await h.call('approve-mic',actor('host'),{target_id:'a'});assert.equal(h.room.data.notices.length,notices);
});

test('host seat stays reserved through disconnect; guests cannot take it or perform host management',async t=>{
 const h=harness(t);await h.create();assert.equal(h.room.data.members.host.seat,0);await h.join(actor('guest'));
 assert.equal((await h.call('release-mic',actor('host'))).status,403);
 assert.equal((await h.call('settings',actor('guest'),{title:'stolen'})).status,403);
 assert.equal((await h.call('seat-invite',actor('guest'),{target_id:'host',seat:1})).status,403);
 h.room.data.members.host.expires=0;await h.room.alarm();
 assert.equal((await h.call('request-mic',actor('guest'),{seat:0})).status,409);
 await h.join(actor('host'));assert.equal(h.room.data.members.host.seat,0);await h.call('request-mic',actor('guest'),{seat:1});
 assert.equal((await h.call('approve-mic',actor('host'),{target_id:'guest'})).status,200);assert.equal(h.room.data.members.guest.seat,1);
 assert.equal((await h.call('moderate',actor('guest'),{target_id:'host',operation:'remove-seat'})).status,403);
});

test('seat invitation acceptance is atomic, expires, remains muted and removal keeps the listener present',async t=>{
 const h=harness(t);await h.create();for(const id of ['a','b'])await h.join(actor(id));
 for(const id of ['a','b'])assert.equal((await h.call('seat-invite',actor('host'),{target_id:id,seat:2})).status,200);
 const accept=id=>h.call('seat-answer',actor(id),{invitation_id:h.room.data.seatInvites[id].id,accept:true});
 const answers=await Promise.all(['a','b'].map(accept));assert.deepEqual(answers.map(r=>r.status),[200,409]);
 assert.equal(h.room.data.members.a.muted,true);assert.equal(h.room.data.members.a.pub,null);
 assert.equal((await h.call('moderate',actor('host'),{target_id:'a',operation:'move-seat',seat:3})).status,200);
 assert.equal(h.room.data.members.a.seat,3);
 assert.equal((await h.call('moderate',actor('host'),{target_id:'a',operation:'remove-seat'})).status,200);
 assert.equal(h.room.data.members.a.seat,null);assert.ok(h.room.data.members.a);
 await h.call('seat-invite',actor('host'),{target_id:'a',seat:2});const expired=h.room.data.seatInvites.a.id;h.room.data.seatInvites.a.expires=0;
 assert.equal((await h.call('seat-answer',actor('a'),{invitation_id:expired,accept:true})).status,409);
});

test('room settings persist and follower eligibility is verified again without invite bypass',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));
 const config={title:'New title',visibility:'followers',background:'night',announcement:'Welcome',max_members:2};
 assert.equal((await h.call('settings',actor('host'),config)).status,200);
 const persisted=h.sql.prepare('SELECT * FROM voice_rooms').get();assert.equal(persisted.announcement,'Welcome');assert.equal(persisted.visibility,'followers');
 assert.equal((await h.call('heartbeat',actor('guest'))).status,200,'visibility edits retain existing listeners');
 assert.equal((await h.join(actor('guest'))).status,403,'a new join must satisfy the new visibility');
 await h.call('invite',actor('host'),{target_id:'guest'});assert.equal((await h.join(actor('guest'))).status,403);
 const follower={...actor('guest'),followedHosts:['host']};assert.equal((await h.join(follower)).status,200);
 assert.equal((await h.join({...actor('extra'),followedHosts:['host']})).status,409);
 const restored=new VoiceRoom(h.ctx,h.env);await restored.load();assert.equal(restored.data.config.announcement,'Welcome');
 assert.equal((await h.call('settings',actor('host'),{visibility:'crew',crew_id:'unowned'})).status,400);
});

test('self mute preserves SFU session for quick resume; host mute retires it and cannot be bypassed',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));await h.call('request-mic',actor('guest'));await h.call('approve-mic',actor('host'),{target_id:'guest'});
 await h.call('publish',actor('guest'),{mid:'0',sessionDescription:offer});await h.call('published',actor('guest'));
 const session=h.room.data.members.guest.pub.sessionId;
 assert.equal((await h.call('self-mute',actor('guest'),{muted:true})).status,200);
 assert.equal(h.room.data.members.guest.pub.sessionId,session);
 const pull=await h.call('subscribe',actor('host'));assert.equal(pull.body.tracks.length,1,'late listeners subscribe to the connected but locally disabled microphone');
 assert.equal((await h.call('self-mute',actor('guest'),{muted:false})).status,200);assert.equal(h.room.data.members.guest.pub.sessionId,session);
 await h.call('moderate',actor('host'),{target_id:'guest',operation:'mute'});assert.equal(h.room.data.members.guest.pub,null);
 assert.equal((await h.call('self-mute',actor('guest'),{muted:false})).status,409);
});

test('oldest current listener succeeds immediately, retaining music, history and permissions across tabs',async t=>{
 const h=harness(t);await h.create();const first=actor('z-first'),last=actor('a-later');
 const firstJoin=await h.join(first);await h.join(last);
 const newTab=await h.join(first);
 assert.notEqual(firstJoin.body.generation,newTab.body.generation);
 assert.equal((await h.call('leave',first,{generation:firstJoin.body.generation})).status,409);
 await h.call('request-mic',last,{seat:4});
 await h.call('approve-mic',actor('host'),{target_id:last.id});
 await h.call('settings',actor('host'),{background:'night',announcement:'Keep this notice'});
 await h.call('music',actor('host'),{operation:'enqueue',track:{id:'song',title:'Song',artist:'Artist',duration:120,cover:'/cover'},request_id:crypto.randomUUID()});
 await h.call('music',actor('host'),{operation:'play',request_id:crypto.randomUUID()});
 await h.call('chat',last,{body:'keep this chat',request_id:crypto.randomUUID()});
 const music=structuredClone(h.room.data.music);
 const before=await h.call('state',first);
 const frames=[];h.ctx.getWebSockets=()=>[{deserializeAttachment:()=>({id:first.id,generation:newTab.body.generation}),send:m=>frames.push(JSON.parse(m))}];
 h.room.notify=VoiceRoom.prototype.notify.bind(h.room);
 assert.equal((await h.call('leave')).status,200);
 assert.equal(frames.length,1);const snapshot=frames[0].state;
 assert.deepEqual(snapshot.music,music);assert.deepEqual(snapshot.chat,before.body.chat);
 assert.equal(snapshot.room.host_id,first.id);assert.equal(snapshot.room.background,'navy');assert.equal(snapshot.room.theme_sku,'navy');
 assert.equal(snapshot.room.announcement,'Keep this notice');assert.equal(snapshot.members.length,2);
 assert.equal(snapshot.members.find(m=>m.id===last.id).seat,4);
 assert.equal(snapshot.members.find(m=>m.id===first.id).seat,0);
 assert.equal(snapshot.members.filter(m=>m.role==='host').length,1);
 assert.ok(snapshot.revision>before.body.revision);
 assert.equal(h.sql.prepare('SELECT host_id FROM voice_rooms').get().host_id,first.id);
 const restored=new VoiceRoom(h.ctx,h.env);await restored.load();assert.equal(restored.data.config.host_id,first.id);
 await h.join(actor('host'));
 for(const operation of ['play','pause','next','previous','move','remove','clear','volume'])
  assert.equal((await h.call('music',actor('host'),{operation,request_id:crypto.randomUUID()})).status,403);
 assert.equal((await h.call('music',first,{operation:'pause',request_id:crypto.randomUUID()})).status,200);
 for(const operation of ['volume','balance'])
  assert.equal((await h.call('music',first,{operation,value:0,request_id:crypto.randomUUID()})).status,400);
 assert.equal(h.room.data.music.volume,music.volume);
});

test('simultaneous and duplicate exits converge, expired candidates are excluded and the last member closes the room',async t=>{
 const h=harness(t);await h.create();for(const id of ['stale','first','remaining'])await h.join(actor(id));
 h.room.data.members.stale.expires=Date.now()-1;
 await Promise.all([h.call('leave'),h.call('leave',actor('first')),h.call('leave')]);
 assert.equal(h.room.data.config.host_id,'remaining');
 assert.deepEqual(Object.keys(h.room.data.members),['remaining']);
 await h.call('leave',actor('first'));assert.equal(h.room.data.config.host_id,'remaining');
 await h.call('leave',actor('remaining'));assert.equal(h.room.data.config.closed,true);
});

test('host grace survives a network interruption and elects once on expiry, including legacy memberships',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=harness(t);await h.create();await h.join(actor('beta'));await h.join(actor('alpha'));
 const d=h.room.data;
 // Legacy equal admission boundaries use the stable account ID as tie-breaker.
 for(const id of ['beta','alpha']){delete d.members[id].joinOrder;d.members[id].chatAfter=0;}
 d.members.host.expires=now-1;await h.room.alarm();
 assert.equal(d.config.host_id,'host');assert.ok(d.hostReconnectUntil>now);
 await h.join(actor('host'));assert.equal(d.members.host.role,'host');assert.equal(d.hostReconnectUntil,0);
 d.members.host.expires=now-1;await h.room.alarm();
 now=d.hostReconnectUntil+1;for(const id of ['alpha','beta'])d.members[id].expires=now+60000;
 await h.room.alarm();assert.equal(d.config.host_id,'alpha');const rev=d.config.settings_revision;
 await h.room.alarm();assert.equal(d.config.settings_revision,rev);
});

test('explicit leave during host recovery completes immediately for the disconnected generation',async t=>{
 const h=harness(t);const host=await h.create();await h.join(actor('guest'));
 h.room.data.members.host.expires=Date.now()-1;await h.room.alarm();
 await h.call('leave',actor('host'),{generation:'stale'});assert.equal(h.room.data.config.host_id,'host');
 await h.call('leave',actor('host'),{generation:host.body.generation});assert.equal(h.room.data.config.host_id,'guest');
});

test('seat request details are private in HTTP and push snapshots and expire on time or host disconnect',async t=>{
 const h=harness(t);await h.create();await h.join(actor('applicant'));await h.join(actor('listener'));
 const delivered=new Map(),sockets=Object.values(h.room.data.members).map(p=>({readyState:1,deserializeAttachment:()=>({id:p.id,generation:p.generation}),send(s){const events=delivered.get(p.id)||[];events.push(JSON.parse(s));delivered.set(p.id,events);},close(){this.readyState=3;}}));
 h.ctx.getWebSockets=()=>sockets;h.room.notify=VoiceRoom.prototype.notify.bind(h.room);
 assert.equal((await h.call('request-mic',actor('applicant'),{seat:4})).status,200);
 assert.equal(delivered.has('listener'),false);
 assert.equal(delivered.get('host').at(-1).state.members.find(m=>m.id==='applicant').requestedSeat,4);
 const publicState=(await h.call('state',actor('listener'))).body,privateMember=publicState.members.find(m=>m.id==='applicant');
 assert.equal('requested' in privateMember,false);assert.equal('requestedSeat' in privateMember,false);assert.equal(privateMember.seat,null);assert.equal(privateMember.publishing,false);
 assert.equal((await h.call('approve-mic',actor('listener'),{target_id:'applicant'})).status,403);
 h.room.data.members.applicant.requestExpires=0;await h.room.alarm();assert.equal(h.room.data.members.applicant.requested,false);
 assert.equal((await h.call('approve-mic',actor('host'),{target_id:'applicant'})).status,409);
 await h.call('request-mic',actor('applicant'),{seat:4});sockets[0].readyState=3;h.room.webSocketClose(sockets[0]);await h.room.queue;
 assert.equal(h.room.data.members.applicant.requested,false);
 await h.call('request-mic',actor('applicant'),{seat:4});await h.call('close');assert.equal(h.room.data.config.closed,true);
});

test('eight publishers concurrently toggle without new SFU sessions, reject stale intent and release seats idempotently',async t=>{
 const h=harness(t);await h.create();const actors=[actor('host'),...Array.from({length:7},(_,i)=>actor('toggle-'+i))];
 for(let i=1;i<8;i++){await h.join(actors[i]);await h.call('request-mic',actors[i],{seat:i});await h.call('approve-mic',actors[0],{target_id:actors[i].id});}
 const sockets=actors.map(a=>({readyState:1,messages:[],deserializeAttachment:()=>({id:a.id,generation:h.room.data.members[a.id]?.generation}),send(s){this.messages.push(JSON.parse(s));},close(){this.readyState=3;}}));
 h.ctx.getWebSockets=()=>sockets;h.room.notify=VoiceRoom.prototype.notify.bind(h.room);
 await Promise.all(actors.map(a=>h.call('publish',a,{mid:'0',sessionDescription:offer})));
 await Promise.all(actors.map(a=>h.call('published',a,{muted:true})));
 const sessions=actors.map(a=>h.room.data.members[a.id].pub.sessionId),allocations=h.calls.length,latencies=[];
 for(let sequence=1;sequence<=10;sequence++){
  const start=performance.now(),muted=sequence%2===0;
  const results=await Promise.all(actors.map(a=>h.call('self-mute',a,{muted,sequence})));assert.ok(results.every(r=>r.status===200));latencies.push(performance.now()-start);
  for(const socket of sockets){const state=socket.messages.at(-1).state;assert.equal(state.members.length,8);assert.ok(state.members.every(p=>p.muted===muted&&p.publishing));}
 }
 assert.equal(h.calls.length,allocations,'mute/unmute must not renegotiate subscriptions or publishers');
 const stale=await h.call('self-mute',actors[1],{muted:false,sequence:3});assert.equal(stale.body.members.find(m=>m.id===actors[1].id).muted,true);
 const revision=h.room.data.revision;await h.call('release-mic',actors[1]);const after=h.room.data.revision;await h.call('release-mic',actors[1]);assert.equal(h.room.data.revision,after);assert.ok(after>revision);
 assert.equal(h.room.data.members[actors[1].id].pub,null);assert.equal(h.room.data.members[actors[1].id].seat,null);assert.equal(Object.keys(h.room.data.members).length,8);
 assert.equal((await h.call('publish',actors[1],{mid:'0',sessionDescription:offer})).status,403);
 await h.call('moderate',actors[0],{target_id:actors[2].id,operation:'remove-seat'});
 assert.equal(h.room.data.members[actors[2].id].pub,null);
 assert.equal((await h.call('moderate',actors[3],{target_id:actors[4].id,operation:'remove-seat'})).status,403);
 await h.call('leave',actors[1]);assert.equal(Object.keys(h.room.data.members).length,7);await h.join(actors[1]);
 assert.equal(h.room.data.members[actors[1].id].seat,null);assert.equal(Object.keys(h.room.data.members).length,8);
 const old=h.room.data.members[actors[4].id].generation;await h.join(actors[4]);assert.notEqual(h.room.data.members[actors[4].id].generation,old);
 assert.equal((await h.call('self-mute',actors[4],{generation:old,muted:false,sequence:11})).status,409);
 for(const i of [0,3,5,6,7]){assert.equal(h.room.data.members[actors[i].id].pub.sessionId,sessions[i]);assert.equal((await h.call('self-mute',actors[i],{muted:false,sequence:11})).status,200);}
 t.diagnostic(JSON.stringify({kind:'mock_sfu_real_room_state_and_push',participants:8,concurrentToggleRounds:10,totalToggles:80,maxRoundMs:Math.round(Math.max(...latencies)),extraSfuAllocations:h.calls.length-allocations,actualAudio:false}));
});

test('seat removal during publication retires the late allocation without reviving publishing permission',async t=>{
 const h=harness(t);await h.create();await h.join(actor('a'));await h.call('request-mic',actor('a'),{seat:1});await h.call('approve-mic',actor('host'),{target_id:'a'});
 let release,entered;const gate=new Promise(r=>entered=r),original=h.room.sfu.tracks;
 h.room.sfu.tracks=async(...args)=>{entered();await new Promise(r=>release=r);return original(...args);};
 const pending=h.call('publish',actor('a'),{mid:'0',sessionDescription:offer});await gate;
 await h.call('moderate',actor('host'),{target_id:'a',operation:'remove-seat'});release();
 assert.equal((await pending).status,409);assert.equal(h.room.data.members.a.pub,null);assert.equal(h.room.data.members.a.seat,null);
 assert.equal((await h.call('published',actor('a'))).status,409);
});

test('seating defaults to approval and only a host can change the policy',async t=>{
 const h=harness(t);await h.create();await h.join(actor('guest'));
 assert.equal(h.room.data.config.seating_mode,'approval');
 assert.equal((await h.call('settings',actor('guest'),{seating_mode:'free'})).status,403);
 assert.equal((await h.call('settings',actor('host'),{seating_mode:'untrusted'})).status,400);
 await h.call('request-mic',actor('guest'),{seat:1});assert.equal(h.room.data.members.guest.seat,null);
 assert.equal(h.room.data.members.guest.requested,true);
 await h.call('settings',actor('host'),{seating_mode:'free'});assert.equal(h.room.data.members.guest.requested,false);
 assert.equal(h.room.data.members.guest.seat,null,'policy change never moves or opens someone’s microphone');
});
test('free seating is atomic, muted, published to every participant and still respects host locks',async t=>{
 const h=harness(t);await h.create();await h.call('settings',actor('host'),{seating_mode:'free'});
 await h.join(actor('one'));await h.join(actor('two'));const notifications=[];h.room.notify=(event,recipients)=>notifications.push({event,recipients});
 const results=await Promise.all(['one','two'].map(id=>h.call('request-mic',actor(id),{seat:1})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const seated=Object.values(h.room.data.members).find(p=>p.seat===1);assert.equal(seated.muted,true);assert.equal(seated.pub,null);assert.equal(seated.requested,false);
 assert.equal(notifications.at(-1).recipients,null,'new occupant must appear to all listeners');
 await h.call('moderate',actor('host'),{target_id:seated.id,operation:'mute'});await h.call('release-mic',actor(seated.id));
 assert.equal((await h.call('request-mic',actor(seated.id),{seat:2})).status,403);
 assert.equal((await h.call('request-mic',actor('two'),{seat:0})).status,409);
});
test('free seating survives durable reload and unrelated settings, then returns to approval',async t=>{
 const h=harness(t);await h.create();await h.call('settings',actor('host'),{seating_mode:'free'});h.room.data=null;
 assert.equal((await h.call('state')).body.room.seating_mode,'free');
 await h.call('settings',actor('host'),{title:'Changed title'});assert.equal(h.room.data.config.seating_mode,'free');
 await h.call('settings',actor('host'),{seating_mode:'approval'});await h.join(actor('guest'));await h.call('request-mic',actor('guest'),{seat:2});
 assert.equal(h.room.data.members.guest.seat,null);assert.equal(h.room.data.members.guest.requested,true);
 delete h.room.data.config.seating_mode;await h.room.save();h.room.data=null;
 assert.equal((await h.call('state')).body.room.seating_mode,'approval');
});
