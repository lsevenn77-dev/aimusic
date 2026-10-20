import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {changeRoomMusic,emptyRoomMusic} from '../shared/voice-music.js';

test('room directory migration preserves existing rooms and audit history',()=>{
 const sql=new DatabaseSync(':memory:');try{
  sql.exec(readFileSync(new URL('../realtime/migrations/0001_rooms.sql',import.meta.url),'utf8'));
  sql.exec("INSERT INTO voice_rooms VALUES('existing','Existing','owner','private',NULL,123,0);INSERT INTO voice_room_events VALUES('event','existing','owner','create',NULL,123)");
  sql.exec(readFileSync(new URL('../realtime/migrations/0002_room_settings.sql',import.meta.url),'utf8'));
  const room=sql.prepare('SELECT * FROM voice_rooms').get();assert.equal(room.id,'existing');assert.equal(room.visibility,'private');assert.equal(room.max_members,30);assert.equal(room.announcement,'');
  assert.equal(sql.prepare('SELECT count(*) n FROM voice_room_events').get().n,1);
  sql.exec("UPDATE voice_rooms SET visibility='followers'");assert.equal(sql.prepare('SELECT visibility FROM voice_rooms').get().visibility,'followers');
 }finally{sql.close();}
});

test('shared music repeat one/all and previous preserve a single authoritative queue',()=>{
 let music=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},{id:'one',duration:10},0);
 music=changeRoomMusic(music,{operation:'enqueue'},{id:'two',duration:10},0);
 music=changeRoomMusic(music,{operation:'repeat',mode:'one'},null,0);
 music=changeRoomMusic(music,{operation:'ended',revision:music.revision},null,10000);
 assert.equal(music.index,0);assert.equal(music.position,0);
 music=changeRoomMusic(music,{operation:'next'},null,10000);assert.equal(music.index,1);
 music=changeRoomMusic(music,{operation:'repeat',mode:'all'},null,10000);
 music=changeRoomMusic(music,{operation:'ended',revision:music.revision},null,20000);assert.equal(music.index,0);
 music=changeRoomMusic(music,{operation:'next'},null,20000);
 music=changeRoomMusic(music,{operation:'previous'},null,20000);assert.equal(music.index,0);
 assert.throws(()=>changeRoomMusic(music,{operation:'repeat',mode:'untrusted'}));
});

test('diagnostics calculate interval loss/concealment without persisting network addresses',async()=>{
 const context=vm.createContext({setInterval:()=>0,clearInterval(){},Date,document:{querySelector:()=>null}});
 vm.runInContext(readFileSync(new URL('../dist/voice-diagnostics.js',import.meta.url),'utf8')+';this.Diagnostics=VoiceDiagnostics;',context);
 let packet=100,lost=2,concealed=10,total=1000;
 const client={closed:false,publisher:null,receiver:{connectionState:'connected',getStats:async()=>new Map([['audio',{id:'rx',type:'inbound-rtp',kind:'audio',packetsReceived:packet,packetsLost:lost,concealedSamples:concealed,totalSamplesReceived:total,jitter:.008,audioLevel:.1,ip:'secret-address'}]])},state:{members:[]}};
 const d=new context.Diagnostics(client);await d.sample();packet=198;lost=4;concealed=30;total=2000;await d.sample();
 const row=d.samples.at(-1);assert.equal(row.lossPercent,2);assert.equal(row.concealmentPercent,2);assert.equal(row.jitterMs,8);assert.equal(row.ip,undefined);
 assert.equal(d.summary().jitterMs.p95,8);assert.equal(d.summary().micEnableMs,null);d.stop();
});

test('chat Enter sends once, Shift Enter and IME composition do not send',()=>{
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'안녕하세요',addEventListener(){},requestSubmit(){this.sent=(this.sent||0)+1;}});return elements.get(id);};
 const c=vm.createContext({navigator:{mediaDevices:{}},VoiceRoomClient:class{},$:get,busyForm:()=>()=>{}});
 vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8')+';this.Client=VoiceRoomClient;',c);
 const client=new c.Client();client.preferences={echo:true};client.host={addEventListener(){}};client.bindFinalControls();const input=get('#voice-message'),form=get('#voice-chat-form');
 let prevented=0;const enter={key:'Enter',preventDefault(){prevented++;}};
 input.onkeydown({...enter,isComposing:true});input.onkeydown({...enter,shiftKey:true});assert.equal(form.sent,undefined);
 input.onkeydown(enter);assert.equal(form.sent,1);assert.equal(prevented,1);
});

