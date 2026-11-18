import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8');
function setup(){
 const contexts=[],timers=new Map(),events=new Map(),button={hidden:true};let captures=0,next=0;
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.resumes=0;this.sources=[];contexts.push(this);}
  resume(){this.resumes++;if(this.blocked)return new Promise(()=>{});this.state='running';this.onstatechange?.();return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createGain(){return {connect(){},gain:{setTargetAtTime(v){this.value=v;}}};}
  createMediaStreamSource(stream){this.sources.push(stream);return {connect(){},disconnect(){}};}
 }
 const host={querySelector:()=>button};
 const context=nicknameContext({URL,window:{AudioContext:Context},document:{addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>host},navigator:{mediaDevices:{getUserMedia(){captures++;throw Error('listeners must never capture');}}},me:{id:'listener'},location:new URL('https://example.test/'),setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);},bindVoiceLobby(){},$:()=>null});
 vm.runInContext(source+';this.Client=VoiceRoomClient;',context);
 const client=Object.assign(Object.create(context.Client.prototype),{host,closed:false,audios:new Map(),volumes:new Map(),preferences:{voice:1},syncMusic(){},state:{self:'listener',members:[{id:'listener',seat:null,muted:true,locked:true},{id:'host',muted:false},{id:'guest',muted:false}]}});
 const click=(href='#voice/fixture',extra={})=>({button:0,target:{closest:()=>({href,target:'',hasAttribute:()=>false})},...extra});
 return {context,contexts,timers,events,button,client,click,get captures(){return captures;}};
}
test('the room-link gesture unlocks playback before asynchronous navigation, without capturing a microphone',()=>{
 const h=setup();h.events.get('click')(h.click());assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].resumes,1);assert.equal(h.contexts[0].state,'running');assert.equal(h.captures,0);
});
test('modified clicks, external pages and signed-out visitors never prepare room audio',()=>{
 const h=setup();for(const e of [h.click('#voice/fixture',{ctrlKey:true}),h.click('#voice/fixture',{defaultPrevented:true}),h.click('https://other.test/#voice/fixture'),h.click('#producer/person')])h.events.get('click')(e);
 vm.runInContext('me=null',h.context);h.events.get('click')(h.click());assert.equal(h.contexts.length,0);
});
test('routing adopts the already-unlocked entry context instead of creating a fresh locked one',()=>{
 const h=setup();h.events.get('click')(h.click());h.context.testClient=h.client;h.client.id='fixture';h.client.bind=function(){this.adopted=this.levelContext;};
 vm.runInContext("voiceController=testClient;bindVoice('voice','fixture')",h.context);
 assert.equal(h.client.adopted,h.contexts[0]);assert.equal(h.timers.size,0);assert.equal(h.captures,0);
});
test('cancelled entry preparation expires and releases its context',()=>{
 const h=setup();h.events.get('click')(h.click());[...h.timers.values()][0]();assert.equal(h.contexts[0].state,'closed');
});
test('late remote tracks reach the listener gain graph with no seat, even if native element playback is blocked',async()=>{
 const h=setup();h.client.resumeSound();await Promise.resolve();
 for(const id of ['host','guest']){const a={srcObject:{id},play:()=>Promise.reject(Error('native autoplay blocked'))};h.client.audios.set(id,a);h.client.applyListenVolumes();h.client.playRemote(a);}
 await Promise.resolve();assert.equal(h.contexts[0].sources.length,2);assert.equal(h.button.hidden,true);assert.equal(h.captures,0);assert.equal(h.client.state.members[0].seat,null);assert.equal(h.client.publisher,undefined);
 for(const a of h.client.audios.values()){assert.equal(a.muted,true);assert.equal(a.voiceGain.gain.value,1);}
});
test('blocked direct-link playback stays visible until context is running; listening never requests a seat or mic',async()=>{
 const h=setup();h.client.levelContext=new h.context.window.AudioContext();h.client.levelContext.blocked=true;
 h.client.roomUIAction=()=>{throw Error('listening must bypass seat/mic actions');};
 await h.client.action('resume-audio');assert.equal(h.button.hidden,false);assert.equal(h.captures,0);
 h.client.levelContext.blocked=false;await h.client.action('resume-audio');await Promise.resolve();assert.equal(h.button.hidden,true);assert.equal(h.captures,0);
 h.client.levelContext.state='suspended';h.client.levelContext.onstatechange();assert.equal(h.button.hidden,false);
});
test('leaving the microphone seat does not change listening gains or start capture',()=>{
 const h=setup();h.client.resumeSound();const a={srcObject:{},play:()=>Promise.resolve()};h.client.audios.set('host',a);h.client.applyListenVolumes();
 h.client.state.members[0].seat=1;h.client.applyListenVolumes();h.client.state.members[0].seat=null;h.client.applyListenVolumes();
 assert.equal(a.voiceGain.gain.value,1);assert.equal(h.contexts[0].sources.length,1);assert.equal(h.captures,0);
});

test('desktop listening recovers with no unlock button and updates connected status without microphone capture',async()=>{
 const h=setup(),c=h.client,status=[];
 c.host={querySelector:()=>null,hasAttribute:name=>name==='data-room-pc-controls'};
 h.context.$=()=>({hasAttribute:()=>true});
 Object.assign(c,{ws:{readyState:1},status:text=>status.push(text),waitForMusicGesture:true});
 c.levelContext=new h.context.window.AudioContext();
 c.updateListening();assert.match(status.at(-1),/청취 대기/);
 const audio={srcObject:{},play:()=>Promise.resolve()};c.audios.set('host',audio);
 c.unlockListening();await Promise.resolve();
 assert.equal(c.waitForMusicGesture,false);assert.equal(c.isListeningBlocked(),false);
 assert.match(status.at(-1),/청취 중/);assert.equal(audio.voiceGain.gain.value,1);
 assert.equal(h.captures,0);assert.equal(c.state.members[0].seat,null);
 c.levelContext.state='suspended';c.updateListening();assert.match(status.at(-1),/청취 대기/);
});

test('desktop unlock gestures retain the explicit interrupted-audio recovery path',()=>{
 const h=setup(),c=h.client,resumed=[];
 c.host={querySelector:()=>null,hasAttribute:()=>true};c.roomAudio={blocked:true};c.resumeSound=explicit=>resumed.push(explicit);
 c.unlockListening();assert.deepEqual(resumed,[true]);assert.equal(h.captures,0);
});

test('the mobile unlock button retains its audio-state visibility while the music gesture remains pending',()=>{
 const h=setup(),c=h.client;
 c.levelContext=new h.context.window.AudioContext();c.levelContext.state='running';c.waitForMusicGesture=true;
 c.updateListening();assert.equal(h.button.hidden,true);
 let resumes=0;c.resumeSound=()=>resumes++;c.unlockListening();
 assert.equal(resumes,1);assert.equal(c.waitForMusicGesture,false);assert.equal(h.captures,0);
});

test('foreground waits for an in-flight refresh and its queued fresh state before restoring sound',async()=>{
 const h=setup(),client=h.client;let resolveFirst,reads=0,resumes=0;
 const first=new Promise(resolve=>resolveFirst=resolve),ended={self:'listener',members:client.state.members,revision:2,karaoke:{phase:'idle',active:null}};
 Object.assign(client,{joined:true,epoch:1,state:{...ended,revision:0,karaoke:{phase:'singing',active:{user_id:'host'}}},
  command(){reads++;return reads===1?first:Promise.resolve(ended);},paint(){},receive:async()=>{},ws:{readyState:0},
  resumeSound(){assert.equal(this.state.karaoke.phase,'idle');resumes++;},socket(){throw Error('must keep the connecting socket');},scheduleReconnect(){throw Error('unexpected reconnect');}});
 const background=client.refresh(),foreground=client.restoreForeground();
 assert.equal(resumes,0);resolveFirst({...ended,revision:1,karaoke:{phase:'singing',active:{user_id:'host'}}});
 await Promise.all([background,foreground]);assert.equal(reads,2);assert.equal(resumes,1);assert.equal(client.refreshTask,null);
});

test('foreground preserves explicit listening mute and never reopens a microphone after seat loss',async()=>{
 const h=setup(),client=h.client;let mics=0;
 Object.assign(client,{joined:true,preferences:{voice:0,music:0},refresh:async()=>{},receive:async()=>{},ws:{readyState:1},foregroundMicDesired:true,
  enableMic(){mics++;},scheduleReconnect(){throw Error('unexpected reconnect');}});
 const audio={srcObject:{},play:()=>Promise.resolve()};client.audios.set('host',audio);
 await client.restoreForeground();assert.equal(mics,0);assert.equal(client.preferences.music,0);assert.equal(audio.voiceGain.gain.value,0);
 assert.equal(client.foregroundMicDesired,false);
});

test('repeated socket opens reuse CONNECTING or OPEN sockets and replace only a changed room generation',()=>{
 const h=setup(),client=h.client,opened=[];
 h.context.WebSocket=class {constructor(url){this.url=url;this.readyState=0;opened.push(this);}close(){this.readyState=3;}};
 Object.assign(client,{joined:true,id:'fixture',generation:'first',status(){}});
 client.socket();client.socket();assert.equal(opened.length,1);
 opened[0].readyState=1;client.socket();assert.equal(opened.length,1);
 client.generation='second';client.socket();assert.equal(opened.length,2);assert.equal(opened[0].readyState,3);
});
