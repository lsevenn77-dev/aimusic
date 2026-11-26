import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRoomMusic,changeRoomMusic,roomMusicPosition} from '../shared/voice-music.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const playing=(m,now)=>changeRoomMusic(m,{operation:'play'},null,now);
const song=id=>({id,title:id,artist:'Artist',duration:120,cover:'/cover'});
test('server clock anchors late joins, pauses and restart without counting each listener',()=>{
 let m=playing(changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),10000),10000);
 assert.equal(roomMusicPosition(m,45000),35);m=changeRoomMusic(m,{operation:'pause'},null,45000);
 assert.equal(roomMusicPosition(m,90000),35);m=changeRoomMusic(m,{operation:'play'},null,90000);
 assert.equal(roomMusicPosition(m,95000),40);assert.equal(m.starts,1);
 m=changeRoomMusic(m,{operation:'restart'},null,95000);assert.equal(m.position,0);assert.equal(m.starts,2);
});
test('queue removal and reorder preserve the currently playing track and position',()=>{
 let m=playing(changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0),0);
 m=changeRoomMusic(m,{operation:'enqueue'},song('two'),1000);m=changeRoomMusic(m,{operation:'enqueue'},song('three'),2000);
 m=changeRoomMusic(m,{operation:'move',index:0,to:2},null,3000);assert.equal(m.index,2);assert.equal(m.queue[m.index].id,'one');assert.equal(m.position,3);
 m=changeRoomMusic(m,{operation:'remove',index:0},null,4000);assert.equal(m.queue[m.index].id,'one');assert.equal(m.position,4);
 m=changeRoomMusic(m,{operation:'remove',index:m.index},null,5000);assert.equal(m.index,-1);assert.equal(m.playing,false);
 m=changeRoomMusic(m,{operation:'enqueue'},song('new'),6000);assert.equal(m.queue[m.index].id,'new');
});
test('duplicate ended callbacks and early ended events do not skip songs',()=>{
 let m=playing(changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0),0);m=changeRoomMusic(m,{operation:'enqueue'},song('two'),0);
 const early=changeRoomMusic(m,{operation:'ended',revision:m.revision},null,1000);assert.equal(early,m);
 const revision=m.revision;m=changeRoomMusic(m,{operation:'ended',revision},null,120000);assert.equal(m.queue[m.index].id,'two');
 assert.equal(changeRoomMusic(m,{operation:'ended',revision},null,120000),m);
});
test('invalid volume, commands, queue size and indices are rejected',()=>{
 const m=emptyRoomMusic();for(const value of [-1,2,NaN,Infinity])assert.throws(()=>changeRoomMusic(m,{operation:'volume',value}));
 assert.throws(()=>changeRoomMusic(m,{operation:'remove',index:0}));assert.throws(()=>changeRoomMusic(m,{operation:'unknown'}));
 let q=m;for(let i=0;i<50;i++)q=changeRoomMusic(q,{operation:'enqueue'},song(String(i)));assert.throws(()=>changeRoomMusic(q,{operation:'enqueue'},song('extra')));
});
function clientFixture(){const c=nicknameContext({crypto,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},setInterval,clearInterval,setTimeout,clearTimeout});vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+';this.Client=VoiceRoomClient;',c);const client=new c.Client('test');client.generation='generation';client.musicAudio={volume:1,currentTime:0,readyState:1,paused:true,ended:false,load(){},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};client.musicTrack='one:generation';return client;}
test('two independent clients converge on room time while preserving personal music volume',()=>{
 const m=playing(changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),Date.now()-35000),Date.now()-35000),a=clientFixture(),b=clientFixture();m.volume=.8;m.balance=.5;
 a.state={music:m};b.state={music:structuredClone(m)};a.preferences.music=.25;b.preferences.music=1;a.syncMusic();b.syncMusic();
 assert.ok(Math.abs(a.musicAudio.currentTime-b.musicAudio.currentTime)<.1);assert.ok(a.musicAudio.currentTime>=35);assert.equal(a.musicAudio.volume,.2);assert.equal(b.musicAudio.volume,.8);
 m.playing=false;m.position=42;a.syncMusic();assert.equal(a.musicAudio.paused,true);assert.equal(a.musicAudio.currentTime,42);
});
test('music mute does not mute voice and remote speaker gains remain personal',()=>{
 const c=clientFixture();c.state={music:{balance:.7}};c.preferences.music=0;c.preferences.voice=.5;c.audios.set('one',{volume:1});c.audios.set('two',{volume:1});c.volumes.set('one',.2);c.applyListenVolumes();assert.equal(c.audios.get('one').volume,.1);assert.equal(c.audios.get('two').volume,.5);
});

test('host seek validates position and stop retains queue without emitting ordinary playback events',()=>{
 let m=playing(changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0),0);
 m=changeRoomMusic(m,{operation:'seek',position:75},null,1000);assert.equal(roomMusicPosition(m,3000),77);
 assert.throws(()=>changeRoomMusic(m,{operation:'seek',position:121}));m=changeRoomMusic(m,{operation:'stop'},null,3000);assert.equal(m.playing,false);assert.equal(m.index,-1);assert.equal(m.queue.length,1);
});

test('enqueue never autoplays, and editing a paused queue does not start audio',()=>{
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0);
 assert.equal(m.playing,false);assert.equal(m.starts,0);assert.equal(roomMusicPosition(m,100000),0);
 m=changeRoomMusic(m,{operation:'enqueue'},song('two'),1000);assert.equal(m.index,0);assert.equal(m.playing,false);
 m=changeRoomMusic(m,{operation:'remove',index:0},null,2000);assert.equal(m.queue[m.index].id,'two');assert.equal(m.playing,false);
 m=changeRoomMusic(m,{operation:'play'},null,3000);assert.equal(m.playing,true);assert.equal(m.starts,1);
 m=changeRoomMusic(m,{operation:'enqueue'},song('three'),4000);assert.equal(m.queue[m.index].id,'two');assert.equal(m.position,1);assert.equal(m.starts,1);
});
test('repeat button cycles off to one to all to off and track endings obey each mode',async()=>{
 const c=nicknameContext({VoiceRoomClient:class{}});
 vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8')+';this.Client=VoiceRoomClient;',c);
 const client=new c.Client();client.state={music:emptyRoomMusic()};client.musicCommand=async(operation,b)=>{client.state.music=changeRoomMusic(client.state.music,{operation,...b});};
 for(const mode of ['one','all','off']){await client.finalAction('music-repeat');assert.equal(client.state.music.repeat,mode);}
 for(const [mode,index,playingAfter] of [['off',-1,false],['one',1,true],['all',0,true]]){
  let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0);m=changeRoomMusic(m,{operation:'enqueue'},song('two'),0);
  m=changeRoomMusic(m,{operation:'next'},null,0);m=changeRoomMusic(m,{operation:'repeat',mode},null,0);
  m=changeRoomMusic(m,{operation:'ended',revision:m.revision},null,120000);
  assert.equal(m.index,index);assert.equal(m.playing,playingAfter);
 }
});

test('room time starts at host readiness, and stale or cancelled starts cannot play a later selection',()=>{
 let state=emptyRoomMusic();
 const command=(operation,now,options={},track)=>{state=changeRoomMusic(state,{operation,...options},track,now);return state;};
 command('enqueue',1000,{},song('one'));command('enqueue',1000,{},song('two'));
 const first=command('play',1000,{wait_for_audio:true}).pendingStart;
 assert.ok(Number.isInteger(first));assert.equal(roomMusicPosition(state,4500),0);assert.equal(state.playing,false);
 command('repeat',4500,{mode:'all'});assert.equal(state.pendingStart,first);
 command('ready',5000,{start_revision:first});assert.equal(state.playing,true);
 assert.equal(state.updated,5000);assert.equal(roomMusicPosition(state,5500),.5);
 const next=command('next',6000,{wait_for_audio:true}).pendingStart;
 assert.notEqual(first,next);assert.equal(state.queue[state.index].id,'two');
 const pending=state;assert.equal(command('ready',7100,{start_revision:first}),pending);
 command('pause',7200);command('ready',8000,{start_revision:next});
 assert.equal(state.playing,false);assert.equal(state.pendingStart,null);
 const restart=command('play',10000,{wait_for_audio:true}).pendingStart;
 command('seek',11000,{position:12});command('ready',12000,{start_revision:restart});
 assert.equal(roomMusicPosition(state,12500),12.5);
 command('stop',13000);assert.equal(state.index,-1);assert.equal(state.queue.length,2);
});

test('cold media and repeated paints never step over the intro or seek during a stall',async()=>{
 const c=clientFixture(),a=c.musicAudio;let position=0,plays=0,finishPlay;
 const seeks=[];Object.defineProperty(a,'currentTime',{get:()=>position,set:v=>{seeks.push(v);position=v;}});
 a.play=()=>{plays++;return new Promise(resolve=>{finishPlay=()=>{a.paused=false;resolve();};});};
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'));
 c.state={music:m};a.readyState=0;c.syncMusic();
 m=playing(m,Date.now()-3200);c.state.music=m;c.syncMusic();a.readyState=1;c.syncMusic();
 assert.equal(plays,0);assert.deepEqual(seeks,[]);
 a.readyState=3;for(let i=0;i<12;i++)c.syncMusic();
 assert.equal(plays,1);finishPlay();await Promise.resolve();c.musicAudible=true;
 position=1;a.readyState=2;for(let i=0;i<15;i++)c.syncMusic();assert.deepEqual(seeks,[]);
 a.readyState=4;c.musicAudible=true;c.syncMusic();assert.ok(a.playbackRate<=1.04);
 c.setMusicClock(1010,1000,1020);c.setMusicClock(5010,5000,8050);assert.equal(c.musicClock,0);
 m=changeRoomMusic(m,{operation:'seek',position:.25});c.state.music=m;c.syncMusic();c.syncMusic();
 assert.deepEqual(seeks,[.25]);assert.equal(plays,1);
});

test('one hour of advancing room snapshots and delayed clock samples causes no transport seeks',()=>{
 const c=clientFixture(),a=c.musicAudio;
 const track={...song('long'),duration:4000},start=Date.now()-3600000;
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},track,start);
 c.state={music:m};c.syncMusic();m=playing(m,start);c.state.music=m;
 let position=0;const seeks=[];
 Object.defineProperty(a,'currentTime',{get:()=>position,set:v=>{seeks.push(v);position=v;}});
 a.readyState=4;a.paused=false;c.syncMusic();c.musicAudible=true;
 for(let i=1;i<=3600;i++){
  position=i;c.musicClock=start+i*1000-Date.now();
  if(i%20===0){m=changeRoomMusic(m,{operation:'repeat',mode:'off'},null,start+i*1000);c.state.music=m;}
  c.syncMusic();
 }
 assert.deepEqual(seeks,[]);assert.equal(a.currentTime,3600);
});

test('a host using a suspended output graph acknowledges the buffered start once after resume',()=>{
 const c=clientFixture(),queued=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'));
 const m=changeRoomMusic(queued,{operation:'play',wait_for_audio:true});
 c.state={self:'host',room:{host_id:'host'},music:m};
 c.levelContext={state:'suspended'};c.musicAudio.voiceGain={};c.playbackGain=()=>{};
 c.musicAudio.readyState=4;const acknowledgments=[];
 c.musicCommand=async (operation,input)=>{acknowledgments.push([operation,input.start_revision]);};
 c.syncMusic();assert.deepEqual(acknowledgments,[]);
 c.levelContext.state='running';c.syncMusic();c.syncMusic();
 assert.deepEqual(acknowledgments,[['ready',m.pendingStart]]);
});
