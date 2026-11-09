import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nicknameContext} from './nickname-context.mjs';

class Events {
 constructor(){this.listeners=new Map();}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(name){for(const fn of [...(this.listeners.get(name)||[])])fn();}
}
class Track extends Events {
 constructor(){super();this.enabled=true;this.readyState='live';this.muted=false;}
 stop(){this.enabled=false;this.readyState='ended';}
}
const stream=track=>({getAudioTracks:()=>[track],getTracks:()=>[track]});
const gain=()=>({connect(){},disconnect(){},gain:{value:1,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}}});
class AudioElement extends Events {
 constructor(){super();this.paused=false;this.muted=false;this.volume=.6;this.plays=0;}
 pause(){this.paused=true;}
 play(){this.plays++;this.paused=false;this.emit('play');return Promise.resolve();}
}
class Context {
 constructor(){this.state='running';this.currentTime=3;this.resumes=0;this.destination={};}
 resume(){this.resumes++;this.state='running';this.onstatechange?.();return Promise.resolve();}
 close(){this.state='closed';return Promise.resolve();}
 createGain(){return gain();}
 createMediaStreamSource(){return {connect(){},disconnect(){}};}
 createMediaElementSource(){return {connect(){},disconnect(){}};}
}
function fixture({supported=true,getUserMedia}={}){
 const session=Object.assign(new Events(),{state:'active',type:'auto'});
 const win=Object.assign(new Events(),{AudioContext:Context});
 const doc=Object.assign(new Events(),{hidden:false});
 const globalAudio=new AudioElement(),messages=[],commands=[];
 const button={hidden:true},host={querySelector:()=>button,querySelectorAll:()=>[]};
 const context=nicknameContext({window:win,document:doc,navigator:{...(supported?{audioSession:session}:{}),mediaDevices:{getUserMedia}},audio:globalAudio,
  crypto,performance,Date,URL,Map,Set,Promise,setTimeout,clearTimeout,setInterval,clearInterval,$:()=>null});
 for(const name of ['room-audio-session.js','voice-rooms.js'])vm.runInContext(readFileSync(new URL('../dist/'+name,import.meta.url),'utf8'),context);
 vm.runInContext('this.Client=VoiceRoomClient;this.Guard=RoomAudioSession;',context);
 const client=new context.Client('room');
 Object.assign(client,{joined:true,generation:'g',epoch:1,host,levelContext:new Context(),microphoneConstraints:()=>({}),
  state:{self:'self',members:[{id:'self',seat:0,muted:false},{id:'speaker',muted:false}]},
  status:text=>messages.push(text),paint(){},stopMicTest(){},acceptState(){},command:async(action,data)=>{commands.push({action,data});return {};}});
 const guard=new context.Guard(client);
 return {client,guard,session,win,doc,globalAudio,messages,commands,context};
}
function publishing(client){
 const raw=new Track(),processed=new Track(),graphContext=new Context(),replacements=[];
 client.stream=stream(raw);
 client.processing={stream:stream(processed),context:graphContext,close(){processed.stop();graphContext.close();}};
 const publisher=client.publisher={connectionState:'connected',closed:false,close(){this.closed=true;}};
 client.micSender={track:processed,replaceTrack:async track=>replacements.push(track)};
 client.micDesired=true;
 return {raw,processed,publisher,graphContext,replacements};
}
test('ordinary app hiding leaves existing room playback and capture running',()=>{
 const {client,guard,doc,session}=fixture();const mic=publishing(client),remote=new AudioElement();client.audios.set('speaker',remote);
 guard.updateType();assert.equal(session.type,'play-and-record');
 doc.hidden=true;doc.emit('visibilitychange');
 assert.equal(remote.paused,false);assert.equal(mic.raw.enabled,true);assert.equal(mic.publisher.closed,false);assert.equal(guard.blocked,false);
});
test('a system interruption immediately retires outgoing capture and silences every room and player output',async()=>{
 const {client,guard,session,globalAudio,commands}=fixture();const mic=publishing(client);
 const remote=new AudioElement();remote.voiceGain=gain();client.audios.set('speaker',remote);
 client.musicAudio=new AudioElement();client.musicAudio.voiceGain=gain();client.liveAudio=new AudioElement();client.livePitch={gain:gain()};
 const outputs=[remote,client.musicAudio,client.liveAudio];
 session.state='interrupted';session.emit('statechange');
 assert.equal(guard.blocked,true);assert.equal(client.micDesired,false);assert.equal(mic.raw.readyState,'ended');assert.equal(mic.processed.readyState,'ended');assert.equal(mic.publisher.closed,true);
 assert.equal(remote.voiceGain.gain.value,0);assert.equal(client.musicAudio.voiceGain.gain.value,0);assert.equal(client.livePitch.gain.gain.value,0);
 for(const output of [...outputs,globalAudio]){assert.equal(output.paused,true);assert.equal(output.muted,true);}
 await guard.muteTask;assert.equal(commands[0].action,'mute');
 // Periodic syncing, volume adjustments and a lock-screen player command must
 // not reopen output while the system interruption is still active.
 client.resumeSound();client.playbackGain(remote,1);await globalAudio.play();
 const late=new AudioElement();client.audios.set('late',late);client.playRemote(late);client.playbackGain(late,1);
 assert.equal(late.plays,0);assert.equal(late.muted,true);assert.equal(globalAudio.paused,true);assert.equal(client.levelContext.resumes,0);
 assert.equal(await guard.allowCapture(true),false);assert.equal(guard.blocked,true);
});
test('system recovery restores listening volumes while capture stays off until an explicit enable',async()=>{
 const {client,guard,session,globalAudio}=fixture();publishing(client);
 const remote=new AudioElement();remote.srcObject={};client.audios.set('speaker',remote);client.preferences.voice=.35;
 session.state='interrupted';session.emit('statechange');await guard.muteTask;
 session.state='active';session.emit('statechange');await Promise.resolve();
 assert.equal(guard.blocked,false);assert.equal(remote.voiceGain.gain.value,.35);assert.equal(remote.paused,false);
 assert.equal(globalAudio.paused,true);assert.equal(globalAudio.muted,false);assert.equal(client.stream,null);assert.equal(client.micDesired,false);
 assert.equal(guard.micNeedsGesture,true);assert.equal(await guard.allowCapture(false),false);
 assert.equal(await guard.allowCapture(true),true);assert.equal(guard.micNeedsGesture,false);assert.equal(session.type,'play-and-record');
});
test('an unmute response already in flight cannot reopen capture after an interruption',async()=>{
 const {client,guard}=fixture();const mic=publishing(client);let finish;
 client.command=(action)=>action==='self-mute'?new Promise(resolve=>finish=resolve):Promise.resolve({});
 const unmute=client.syncMicIntent();guard.interrupt('session');finish({});await unmute;await guard.muteTask;
 assert.equal(mic.raw.enabled,false);assert.equal(mic.processed.enabled,false);assert.equal(mic.publisher.closed,true);assert.equal(client.micSender,null);
});
test('a microphone permission result arriving during interruption is stopped without publishing',async()=>{
 let grant;const {client,guard}=fixture({getUserMedia:()=>new Promise(resolve=>grant=resolve)});
 const capture=client.captureMicrophone();guard.interrupt('session');const raw=new Track();grant(stream(raw));
 assert.equal(await capture,null);assert.equal(raw.readyState,'ended');assert.equal(client.publisher,null);
});
test('a processing interruption never switches the publisher to the raw microphone',()=>{
 const {client,guard}=fixture({supported:false});const mic=publishing(client);
 client.watchProcessing();mic.graphContext.state='interrupted';mic.graphContext.onstatechange();
 assert.equal(guard.blocked,true);assert.equal(mic.replacements.length,0);assert.equal(mic.raw.enabled,false);assert.equal(mic.publisher.closed,true);
});
test('a muted raw microphone signals interruption and capture arriving after it is rejected',()=>{
 const {client,guard}=fixture({supported:false});const mic=publishing(client);
 assert.equal(guard.watchMicrophone(client.stream),true);mic.raw.muted=true;mic.raw.emit('mute');
 assert.equal(guard.blocked,true);const late=new Track();assert.equal(guard.watchMicrophone(stream(late)),false);assert.equal(late.readyState,'ended');
});
test('an explicit microphone restart waits for the old server mute and does not start automatically',async()=>{
 const {client,guard,session}=fixture();publishing(client);let finish,allowed=false;
 client.command=()=>new Promise(resolve=>finish=resolve);guard.interrupt('session');await Promise.resolve();
 session.state='active';session.emit('statechange');
 const request=guard.allowCapture(true).then(value=>{allowed=value;});await Promise.resolve();assert.equal(allowed,false);
 finish({});await request;assert.equal(allowed,true);assert.equal(client.stream,null);
});
test('leaving releases event observers, restores session ownership and never resumes the global player',()=>{
 const {guard,session,globalAudio}=fixture();guard.interrupt('session');guard.dispose();
 assert.equal(session.type,'auto');assert.equal(globalAudio.muted,false);assert.equal(globalAudio.paused,true);
 session.state='interrupted';session.emit('statechange');assert.equal(globalAudio.muted,false);
});

test('retired microphone tracks release their listeners without detaching an active test capture',()=>{
 const {client,guard,session}=fixture(),mic=publishing(client),testTrack=new Track();
 guard.watchMicrophone(client.stream);client.testRaw=stream(testTrack);guard.watchMicrophone(client.testRaw);
 const listeningContext=client.levelContext;
 client.stopMicrophone();guard.updateType();guard.watchMicrophone(client.testRaw);
 assert.equal(mic.raw.readyState,'ended');assert.equal(mic.raw.listeners.get('mute').size,0);
 assert.equal(guard.tracks.has(mic.raw),false);assert.equal(guard.tracks.size,1);
 assert.equal(testTrack.listeners.get('mute').size,1);assert.equal(testTrack.readyState,'live');
 assert.equal(guard.disposed,false);assert.equal(client.levelContext,listeningContext);assert.equal(session.type,'play-and-record');
 mic.raw.emit('mute');assert.equal(guard.blocked,false);
 testTrack.muted=true;testTrack.emit('mute');assert.equal(guard.blocked,true);
 testTrack.stop();guard.updateType();assert.equal(guard.tracks.size,0);assert.equal(testTrack.listeners.get('mute').size,0);
});


test('turning the microphone off while restart waits for server cleanup cancels that restart',async()=>{
 let captures=0,finish,requests=0;
 const {client,guard,session}=fixture({getUserMedia:async()=>{captures++;return stream(new Track());}});
 publishing(client);client.command=()=>++requests===1?new Promise(resolve=>finish=resolve):Promise.resolve({});
 guard.interrupt('session');await Promise.resolve();session.state='active';session.emit('statechange');
 client.micDesired=true;const enable=client.enableMic(true);await Promise.resolve();
 await client.mute();finish({});await enable;
 assert.equal(captures,0);assert.equal(client.micDesired,false);assert.equal(guard.micNeedsGesture,true);
});
