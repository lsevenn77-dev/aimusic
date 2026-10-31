import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {VoiceRoom} from '../realtime/worker-live-karaoke.js';
import voiceWorker from '../realtime/worker-live-karaoke.js';
import {signedHeaders} from '../realtime/protocol.js';
const actor=id=>({id,name:id,profile_id:id+'-profile',crews:[],blocks:[],followedHosts:[]});
const track=id=>({id,title:id,artist:'AIFECT',duration:120,cover:'/cover'});
function harness(t,mode='karaoke'){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_rooms.sql','0002_room_settings.sql'])db.exec(readFileSync(new URL('../realtime/migrations/'+file,import.meta.url),'utf8'));
 t.after(()=>db.close());
 const env={ROOM_DB:{prepare(q){return {bind(...args){const stmt=db.prepare(q);return {async run(){stmt.run(...args);},async all(){return {results:stmt.all(...args)};}};}};}}};
 const alarms=[],saved=new Map(),ctx={storage:{async get(k){return structuredClone(saved.get(k));},async put(k,v){saved.set(k,structuredClone(v));},async setAlarm(at){alarms.push(at);}},getWebSockets(){return [];}};
 const room=new VoiceRoom(ctx,env);room.notify=()=>{};room.sfu={async create(){return 'fake';},async close(){return {resolved:true};},async tracks(){throw Error('mock audio not supported');}};
 const call=async(action,a=actor('host'),input={})=>{const r=await room.fetch(new Request('https://room/'+action,{method:'POST',body:JSON.stringify({actor:a,input,roomId:'live-test',stamp:{nonce:crypto.randomUUID(),timestamp:Date.now()}})}));return {status:r.status,body:await r.json()};};
 const create=()=>call('create',actor('host'),{title:'Live karaoke',visibility:'public',mode});
 const join=id=>call('join',actor(id),{request_id:crypto.randomUUID()});
 const request=(id,song)=>call('karaoke',actor(id),{operation:'request',request_id:crypto.randomUUID(),track:track(song)});
 const accept=(id)=>call('karaoke',actor(id),{operation:'accept',invitation_id:room.data.karaoke.active?.invitation_id});
 return {db,env,room,ctx,call,create,join,request,accept,alarms,saved};
}
test('current production Worker: one singer only, protected queue, finish and next',async t=>{
 const h=harness(t);assert.equal((await h.create()).status,200);await h.join('alice');await h.join('bob');
 assert.equal(h.room.data.config.mode,'karaoke');
 assert.equal((await h.call('publish',actor('bob'))).status,403);
 assert.equal((await h.call('request-mic',actor('alice'))).status,409);
 assert.equal((await h.request('alice','one')).status,200);
 assert.equal((await h.request('bob','two')).status,200);
 assert.equal((await h.request('alice','two')).status,409);
 assert.equal((await h.call('karaoke',actor('bob'),{operation:'call'})).status,403);
 assert.equal((await h.call('karaoke',actor('host'),{operation:'call'})).status,200);
 assert.equal(h.room.data.karaoke.active.user_id,'alice');
 assert.equal(h.room.data.members.alice.seat,1);
 assert.equal((await h.call('published',actor('host'))).status,403);
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'start'})).status,409);
 assert.equal((await h.accept('alice')).status,200);
 h.room.data.members.alice.pub={ready:true};h.room.data.members.alice.muted=false;
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'start'})).status,200);
 assert.equal(h.room.data.karaoke.phase,'singing');
 assert.equal((await h.call('karaoke',actor('bob'),{operation:'finish'})).status,403);
 assert.equal((await h.call('karaoke',actor('host'),{operation:'next'})).status,200);
 assert.equal(h.room.data.karaoke.active.user_id,'bob');
 assert.equal(h.room.data.members.alice.pub,null);assert.equal(h.room.data.members.alice.seat,null);
 assert.equal((await h.call('karaoke',actor('bob'),{operation:'finish'})).status,200);
 assert.equal(h.room.data.karaoke.active,null);
});
test('existing talking rooms keep current free-seat behavior and cannot change type',async t=>{
 const h=harness(t,'talk');assert.equal((await h.create()).status,200);await h.join('alice');
 assert.equal((await h.call('karaoke',actor('host'),{operation:'request',request_id:crypto.randomUUID(),track:track('one')})).status,409);
 assert.equal((await h.call('settings',actor('host'),{mode:'karaoke',title:'alter'})).status,400);
 assert.equal(h.room.data.config.mode,'talk');
 const changes=await h.call('settings',actor('host'),{seating_mode:'free',title:'free seating'});
 assert.equal(changes.status,200);assert.equal(h.room.data.config.seating_mode,'free');
 assert.equal((await h.call('request-mic',actor('alice'),{seat:1})).status,200);
});
test('production directory exposes karaoke mode and rejects unauthorized singers',async t=>{
 const h=harness(t);await h.create();await h.join('alice');
 const secret='test-karaoke-production-only-000001';
 const path='/rooms/directory/list',body=JSON.stringify({actor:actor('host'),input:{}});
 const r=await voiceWorker.fetch(new Request('https://worker'+path,{method:'POST',headers:await signedHeaders(secret,path,body),body}),{...h.env,VOICE_BRIDGE_SECRET:secret,ROOMS:{idFromName:id=>id,get:()=>({fetch:input=>h.room.fetch(input)})}});
 assert.equal(r.status,200);assert.equal((await r.json()).rooms[0].mode,'karaoke');
 await h.request('alice','one');await h.call('karaoke',actor('host'),{operation:'call'});
 assert.equal((await h.call('self-mute',actor('host'),{muted:false})).status,403);
 const member=h.room.data.members.alice;member.pub={ready:true};member.muted=false;
 await h.accept('alice');
 await h.call('karaoke',actor('host'),{operation:'start'});
 h.room.data.karaoke.startsAt=Date.now()-130000;
 await h.room.alarm();assert.equal(h.room.data.karaoke.active,null);
});


test('server invitation expires at ten seconds, advances once and leaves an empty queue idle',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=harness(t);await h.create();await h.join('alice');await h.join('bob');
 await h.request('alice','one');await h.request('bob','two');await h.call('karaoke',actor('host'),{operation:'call'});
 const k=h.room.data.karaoke,first=k.active.invitation_id;
 assert.equal(k.phase,'invited');assert.equal(k.inviteExpiresAt,now+10000);assert.equal(h.alarms.at(-1),now+10000);
 assert.equal((await h.call('publish',actor('alice'))).status,403,'invited alone must not allow microphone publishing');
 assert.equal((await h.accept('host')).status,403);
 now+=9999;await h.room.alarm();assert.equal(k.active.user_id,'alice');
 assert.equal(h.alarms.at(-1),now+1,'activity must not postpone the absolute deadline');
 now++;await h.room.alarm();assert.equal(k.active.user_id,'bob');assert.equal(k.inviteExpiresAt,now+10000);
 assert.equal(h.room.data.members.alice.seat,null);
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'accept',invitation_id:first})).status,403);
 await h.room.alarm();assert.equal(k.active.user_id,'bob','repeat alarm cannot skip the new invite');
 now+=10000;await h.room.alarm();assert.equal(k.active,null);assert.equal(k.phase,'idle');assert.equal(k.inviteExpiresAt,0);
});

test('acceptance is tied to one invitation and media setup is not charged to the response deadline',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=harness(t);await h.create();await h.join('alice');await h.request('alice','one');await h.call('karaoke',actor('host'),{operation:'call'});
 const k=h.room.data.karaoke,id=k.active.invitation_id;
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'accept',invitation_id:'stale'})).status,409);
 now+=9999;assert.equal((await h.accept('alice')).status,200);assert.equal(k.phase,'ready');assert.equal(k.inviteExpiresAt,0);
 now+=12000;await h.room.alarm();assert.equal(k.active.user_id,'alice');assert.equal(k.phase,'ready');
 assert.equal((await h.accept('alice')).status,200,'accept retry is idempotent');
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'start',invitation_id:id})).status,409,'actual microphone is still required');
 h.room.data.members.alice.pub={ready:true};h.room.data.members.alice.muted=false;
 assert.equal((await h.call('karaoke',actor('alice'),{operation:'start',invitation_id:id})).status,200);
 assert.equal(k.startsAt,now+3000,'keep the separate music countdown');
});

test('persisted invitations survive reload and skip locked or departed reservations',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=harness(t);await h.create();for(const id of ['alice','bob','carol'])await h.join(id);
 for(const id of ['alice','bob','carol'])await h.request(id,'one');
 await h.call('karaoke',actor('host'),{operation:'call'});
 h.room.data.members.bob.locked=true;await h.room.save();
 const restored=new VoiceRoom(h.ctx,h.env);restored.notify=()=>{};
 now+=10000;await restored.alarm();
 assert.equal(restored.data.karaoke.active.user_id,'carol');assert.equal(restored.data.karaoke.inviteExpiresAt,now+10000);
 assert.equal(h.alarms.at(-1),now+10000);
});

test('leaving an invitation advances immediately and an expired accept cannot regain the turn',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=harness(t);await h.create();await h.join('alice');await h.join('bob');
 await h.request('alice','one');await h.request('bob','two');await h.call('karaoke',actor('host'),{operation:'call'});
 await h.call('leave',actor('alice'));assert.equal(h.room.data.karaoke.active.user_id,'bob');
 const old=h.room.data.karaoke.active.invitation_id;now+=10000;
 assert.equal((await h.call('karaoke',actor('bob'),{operation:'accept',invitation_id:old})).status,403);
 assert.equal(h.room.data.karaoke.active,null);
});

test('operational worker keeps the archived talking-room base and exactly appends the maintained add-on',()=>{
 const root=new URL('../realtime/',import.meta.url);
 const worker=readFileSync(new URL('worker-live-karaoke.js',root),'utf8');
 const addon=readFileSync(new URL('live-karaoke-addon.js',root),'utf8');
 assert.equal(worker.slice(worker.indexOf('// Production add-on:')),addon);
});
