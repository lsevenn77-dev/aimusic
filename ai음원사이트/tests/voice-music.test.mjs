import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRoomMusic,changeRoomMusic,roomMusicPosition} from '../shared/voice-music.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const song=id=>({id,title:id,artist:'Artist',duration:120,cover:'/cover'});
test('server clock anchors late joins, pauses and restart without counting each listener',()=>{
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),10000);
 assert.equal(roomMusicPosition(m,45000),35);m=changeRoomMusic(m,{operation:'pause'},null,45000);
 assert.equal(roomMusicPosition(m,90000),35);m=changeRoomMusic(m,{operation:'play'},null,90000);
 assert.equal(roomMusicPosition(m,95000),40);assert.equal(m.starts,1);
 m=changeRoomMusic(m,{operation:'restart'},null,95000);assert.equal(m.position,0);assert.equal(m.starts,2);
});
test('queue removal and reorder preserve the currently playing track and position',()=>{
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0);
 m=changeRoomMusic(m,{operation:'enqueue'},song('two'),1000);m=changeRoomMusic(m,{operation:'enqueue'},song('three'),2000);
 m=changeRoomMusic(m,{operation:'move',index:0,to:2},null,3000);assert.equal(m.index,2);assert.equal(m.queue[m.index].id,'one');assert.equal(m.position,3);
 m=changeRoomMusic(m,{operation:'remove',index:0},null,4000);assert.equal(m.queue[m.index].id,'one');assert.equal(m.position,4);
 m=changeRoomMusic(m,{operation:'remove',index:m.index},null,5000);assert.equal(m.index,-1);assert.equal(m.playing,false);
 m=changeRoomMusic(m,{operation:'enqueue'},song('new'),6000);assert.equal(m.queue[m.index].id,'new');
});
test('duplicate ended callbacks and early ended events do not skip songs',()=>{
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0);m=changeRoomMusic(m,{operation:'enqueue'},song('two'),0);
 const early=changeRoomMusic(m,{operation:'ended',revision:m.revision},null,1000);assert.equal(early,m);
 const revision=m.revision;m=changeRoomMusic(m,{operation:'ended',revision},null,120000);assert.equal(m.queue[m.index].id,'two');
 assert.equal(changeRoomMusic(m,{operation:'ended',revision},null,120000),m);
});
test('invalid volume, commands, queue size and indices are rejected',()=>{
 const m=emptyRoomMusic();for(const value of [-1,2,NaN,Infinity])assert.throws(()=>changeRoomMusic(m,{operation:'volume',value}));
 assert.throws(()=>changeRoomMusic(m,{operation:'remove',index:0}));assert.throws(()=>changeRoomMusic(m,{operation:'unknown'}));
 let q=m;for(let i=0;i<50;i++)q=changeRoomMusic(q,{operation:'enqueue'},song(String(i)));assert.throws(()=>changeRoomMusic(q,{operation:'enqueue'},song('extra')));
});
function clientFixture(){const c=vm.createContext({crypto,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},setInterval,clearInterval,setTimeout,clearTimeout});vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+';this.Client=VoiceRoomClient;',c);const client=new c.Client('test');client.generation='generation';client.musicAudio={volume:1,currentTime:0,readyState:1,paused:true,ended:false,load(){},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};client.musicTrack='one:generation';return client;}
test('two independent clients converge on room time while preserving personal music volume',()=>{
 const m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),Date.now()-35000),a=clientFixture(),b=clientFixture();m.volume=.8;m.balance=.5;
 a.state={music:m};b.state={music:structuredClone(m)};a.preferences.music=.25;b.preferences.music=1;a.syncMusic();b.syncMusic();
 assert.ok(Math.abs(a.musicAudio.currentTime-b.musicAudio.currentTime)<.1);assert.ok(a.musicAudio.currentTime>=35);assert.equal(a.musicAudio.volume,.2);assert.equal(b.musicAudio.volume,.8);
 m.playing=false;m.position=42;a.syncMusic();assert.equal(a.musicAudio.paused,true);assert.equal(a.musicAudio.currentTime,42);
});
test('music mute does not mute voice and remote speaker gains remain personal',()=>{
 const c=clientFixture();c.state={music:{balance:.7}};c.preferences.music=0;c.preferences.voice=.5;c.audios.set('one',{volume:1});c.audios.set('two',{volume:1});c.volumes.set('one',.2);c.applyListenVolumes();assert.equal(c.audios.get('one').volume,.1);assert.equal(c.audios.get('two').volume,.5);
});

test('host seek validates position and stop retains queue without emitting ordinary playback events',()=>{
 let m=changeRoomMusic(emptyRoomMusic(),{operation:'enqueue'},song('one'),0);
 m=changeRoomMusic(m,{operation:'seek',position:75},null,1000);assert.equal(roomMusicPosition(m,3000),77);
 assert.throws(()=>changeRoomMusic(m,{operation:'seek',position:121}));m=changeRoomMusic(m,{operation:'stop'},null,3000);assert.equal(m.playing,false);assert.equal(m.index,-1);assert.equal(m.queue.length,1);
});
