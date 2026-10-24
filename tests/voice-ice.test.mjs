import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8');
function harness(extra={}){
 let now=0,next=0;const timers=new Map(),events=[];
 const context=vm.createContext({performance:{now:()=>now},setTimeout(fn,ms){timers.set(++next,{fn,at:now+ms});return next;},clearTimeout(id){timers.delete(id);},...extra});
 vm.runInContext(source+';this.Client=VoiceRoomClient;',context);
 const client=Object.assign(Object.create(context.Client.prototype),{diagnostics:{record:(...v)=>events.push(v)}});
 const pc=Object.assign(new EventTarget(),{iceGatheringState:'gathering',connectionState:'new',localDescription:{sdp:'v=0\r\na=candidate:1 1 udp 1 192.0.2.1 1000 typ host\r\n'}});
 const tick=ms=>{const target=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();}now=target;};
 return {client,pc,tick,timers,events};
}
test('existing host candidates proceed after bounded gather when STUN never completes',async()=>{
 const h=harness();const pending=h.client.ice(h.pc);h.tick(1500);await pending;
 assert.equal(h.pc.iceGatheringState,'gathering');assert.equal(h.timers.size,0);assert.deepEqual(h.events,[['iceGatherMs',1500],['icePartialCandidates',1]]);
});
test('candidate discovery before the deadline and ordinary complete gathering both work',async()=>{
 const h=harness();h.pc.localDescription.sdp='v=0\r\n';const p=h.client.ice(h.pc);h.tick(1500);
 assert.equal(h.timers.size,1);h.pc.localDescription.sdp+='a=candidate:1 1 udp 1 192.0.2.1 1000 typ host\r\n';h.pc.dispatchEvent(new Event('icecandidate'));await p;assert.equal(h.timers.size,0);
 const f=harness();const done=f.client.ice(f.pc);f.tick(10);f.pc.iceGatheringState='complete';f.pc.dispatchEvent(new Event('icegatheringstatechange'));await done;
 assert.deepEqual(f.events,[['iceGatherMs',10]]);assert.equal(f.timers.size,0);
});
test('no candidates and a cancelled connection never produce a misleading successful negotiation',async()=>{
 const h=harness();h.pc.localDescription.sdp='v=0\r\n';const p=h.client.ice(h.pc);h.tick(10000);await assert.rejects(p,/연결 경로/);assert.equal(h.timers.size,0);
 const f=harness();const cancelled=f.client.ice(f.pc);f.pc.connectionState='closed';f.pc.dispatchEvent(new Event('connectionstatechange'));await assert.rejects(cancelled,/취소/);assert.equal(f.timers.size,0);
});
test('tapping the room retries remote playback as well as music/context unlocking',async()=>{
 const calls=[],a={play(){calls.push('remote');return Promise.resolve();}};
 const {client}=harness({window:{},$(){}});Object.assign(client,{audios:new Map([['speaker',a]]),syncMusic(){calls.push('music');}});
 client.resumeSound();await Promise.resolve();assert.deepEqual(calls,['remote','music']);
});
test('autoplay rejection exposes the existing sound button without disturbing microphone capture',async()=>{
 const button={hidden:true},a={play:()=>Promise.reject(Error('autoplay'))},publisher={connectionState:'connected'};
 const {client}=harness();Object.assign(client,{audios:new Map([['speaker',a]]),host:{querySelector:()=>button},publisher});client.playRemote(a);await Promise.resolve();
 assert.equal(button.hidden,false);assert.equal(client.publisher,publisher);
});
test('live voices use a MediaStream source and music keeps its media-element source, without double playback',()=>{
 const created=[],node=()=>({connect(next){return next;},disconnect(){this.disconnected=true;},gain:{setTargetAtTime(v){this.value=v;}}});
 const context={state:'running',currentTime:0,destination:node(),createGain:node,createMediaStreamSource(stream){created.push(['stream',stream]);return node();},createMediaElementSource(a){created.push(['music',a]);return node();}};
 const {client}=harness();client.levelContext=context;
 const stream={},voice={srcObject:stream,pause(){this.paused=true;}},music={};client.playbackGain(voice,.4);client.playbackGain(music,.7);
 assert.equal(created[0][0],'stream');assert.equal(created[0][1],stream);assert.equal(created[1][0],'music');assert.equal(voice.muted,true);assert.equal(voice.voiceGain.gain.value,.4);
 client.playbackGain(voice,.2);assert.equal(created.length,2);assert.equal(voice.voiceGain.gain.value,.2);
 context.state='suspended';client.playbackGain(voice,.3);assert.equal(voice.muted,false);assert.equal(voice.volume,.3);assert.equal(voice.voiceGain.gain.value,0);
 context.state='running';client.playbackGain(voice,.3);assert.equal(voice.muted,true);assert.equal(voice.voiceGain.gain.value,.3);
 const source=voice.voiceSource,gain=voice.voiceGain;client.releaseRemote(voice);assert.equal(source.disconnected,true);assert.equal(gain.disconnected,true);assert.equal(voice.srcObject,null);assert.equal(voice.paused,true);
});

test('receiving completes SDP and confirms transport; output device errors do not renegotiate',async()=>{
 const calls=[],timers=[];let closed=0;
 const pc={connectionState:'new',close(){closed++;},async setRemoteDescription(){calls.push('offer');},async createAnswer(){return {type:'answer',sdp:'local'};},async setLocalDescription(d){this.localDescription=d;calls.push('local');}};
 const {client}=harness({setTimeout(fn){timers.push(fn);return timers.length;},fetch:async(url)=>({ok:true,json:async()=>url.endsWith('/subscribe')?{sessionDescription:{type:'offer',sdp:'remote'},tracks:[{mid:'0',user_id:'speaker'}],negotiation:'n'}:{ok:true}})});
 Object.assign(client,{id:'fixture',epoch:1,generation:'g',state:{self:'listener',members:[{id:'speaker',publishing:true,mediaKey:'one'}]},audios:new Map(),mediaQueue:Promise.resolve(),clearRemoteMeters(){},pc:()=>pc,ice:async()=>calls.push('ice'),connected:async()=>{calls.push('connected');pc.connectionState='connected';},output:async()=>{throw Error('missing output');},status:()=>calls.push('output hint')});
 const received=client.receive();await Promise.resolve();await Promise.resolve();timers.shift()();await received;
 assert.deepEqual(calls,['offer','local','ice','connected','output hint']);assert.equal(client.receiver,pc);assert.equal(closed,0);assert.equal(client.receiveKey,'speaker:one');
});
