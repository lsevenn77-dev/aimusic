import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {VoiceRoom} from '../realtime/room.js';
import {signedHeaders,verifyRequest,audioOffer,audioAnswer} from '../realtime/protocol.js';
import voiceWorker from '../realtime/worker.js';
import {fixture} from './fixture.mjs';
import {voiceRoomsRoute} from '../server/voice-rooms.js';
import {hash} from '../server/auth.js';
import {Sfu} from '../realtime/sfu.js';
import vm from 'node:vm';
import siteWorker from '../server/index.js';
const secret='test-only-bridge-secret-not-production-0001';
const actor=(id,crews=[])=>({id,name:id,profile_id:id+'-profile',crews});
const offer={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=sendonly\r\n'};
function harness(t) {
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../realtime/migrations/0001_rooms.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const env={ROOM_DB:{prepare(q){return {bind(...args){const s=sql.prepare(q);return {async run(){s.run(...args);},async all(){return {results:s.all(...args)};}};}};}}};
 const saved=new Map(),events=[];
 const ctx={storage:{async get(k){return structuredClone(saved.get(k));},async put(k,v){saved.set(k,structuredClone(v));},async setAlarm(t){ctx.alarm=t;}},getWebSockets:()=>[]};
 const room=new VoiceRoom(ctx,env);let next=0,failClose=false,failTracks=false;const closes=[],calls=[];
 room.sfu={async create(){return 'session-'+(++next);},async tracks(id,b){calls.push({id,b});if(failTracks)throw Error('timeout');return {sessionDescription:{type:b.sessionDescription?'answer':'offer',sdp:'test'},tracks:b.tracks.map((x,i)=>({...x,mid:String(i)})),requiresImmediateRenegotiation:!b.sessionDescription};},async answer(id,b){calls.push({id,answer:b});},async close(id,mids){closes.push(id);if(failClose)throw Error('upstream down');}};
 room.notify=e=>events.push(e);
 const call=async(action,a=actor('host'),input={},stamp={nonce:crypto.randomUUID(),timestamp:Date.now()})=>{const r=await room.fetch(new Request('https://room/'+action,{method:'POST',body:JSON.stringify({roomId:'test-room',actor:a,input,stamp})}));return {status:r.status,body:await r.json()};};
 const join=a=>call('join',a,{request_id:crypto.randomUUID()});
 const create=async(visibility='public',crew_id)=>{assert.equal((await call('create',actor('host',crew_id?[crew_id]:[]),{title:'Music together',visibility,crew_id})).status,200);return join(actor('host',crew_id?[crew_id]:[]));};
 return {room,env,call,join,create,sql,closes,calls,events,ctx,setFailClose:v=>failClose=v,setFailTracks:v=>failTracks=v};
}
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
 const h=harness(t);await h.create();for(let i=0;i<9;i++){await h.join(actor('u'+i));await h.call('request-mic',actor('u'+i));}
 assert.equal((await h.call('approve-mic',actor('u0'),{target_id:'u0'})).status,403);assert.equal((await h.call('moderate',actor('host'),{target_id:'constructor',operation:'admin'})).status,400);
 const approvals=await Promise.all(Array.from({length:9},(_,i)=>h.call('approve-mic',actor('host'),{target_id:'u'+i})));assert.equal(approvals.filter(x=>x.status===200).length,8);assert.equal(approvals[8].status,409);
 assert.equal((await h.call('publish',actor('u8'),{mid:'0',sessionDescription:offer})).status,403);
 await h.call('moderate',actor('host'),{target_id:'u0',operation:'admin'});
 assert.equal((await h.call('moderate',actor('u0'),{target_id:'host',operation:'ban'})).status,403);
 assert.equal((await h.call('moderate',actor('u0'),{target_id:'u1',operation:'admin'})).status,403);
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
 await h.call('moderate',actor('host'),{target_id:'guest',operation:'ban'});assert.equal((await h.join(actor('guest'))).status,403);
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
 const c=vm.createContext({crypto,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},navigator:{mediaDevices:{}},fetch:async()=>Response.json({}),setInterval,clearInterval,setTimeout,clearTimeout,$:()=>({value:''})});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\nthis.Client=VoiceRoomClient;',c);
 const client=new c.Client('test');client.joined=true;client.epoch=1;client.state={revision:2};let reply;client.command=()=>new Promise(r=>reply=r);client.paint=()=>assert.fail('stale response painted');
 const pending=client.refresh();client.epoch=2;reply({revision:1});await pending;assert.equal(client.state.revision,2);
 let grant,stops=0;c.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>grant=r);client.paint=()=>{};
 const opening=client.enableMic();client.leave(false);grant({getTracks:()=>[{stop:()=>stops++}]});await opening;assert.equal(stops,1);assert.equal(client.stream,undefined);
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
 const b={profile_id:'other-profile',gift_type:'balloon',quantity:3,request_id:crypto.randomUUID()};
 const a=await f.call('/api/voice/rooms/test-room/gifts','POST',b);assert.equal(a.status,201,JSON.stringify(a.body));
 const again=await f.call('/api/voice/rooms/test-room/gifts','POST',b);assert.equal(again.body.gift.id,a.body.gift.id);assert.equal(again.body.balance,85);assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert.equal(h.events.filter(e=>e?.type==='gift').length,1);
 assert.equal((await f.call('/api/voice/rooms/test-room/gifts','POST',{...b,quantity:4})).status,409);
 const invite={profile_id:'other-profile',request_id:crypto.randomUUID()};assert.equal((await f.call('/api/voice/rooms/test-room/invite','POST',invite)).status,201);assert.equal((await f.call('/api/voice/rooms/test-room/invite','POST',invite)).status,201);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,1);assert.match(f.sql.prepare('SELECT body FROM direct_messages').get().body,/#voice\/test-room/);
});
