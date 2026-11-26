import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function clientHarness(extra={}){
 const timers=[];
 const context=nicknameContext({
  RTCPeerConnection:class {close(){this.closed=true;}},
  setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
  ...extra
 });
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+';this.Client=VoiceRoomClient;',context);
 return {client:Object.create(context.Client.prototype),timers};
}
test('failed receive transport retries listening without resetting the live microphone',()=>{
 const {client,timers}=clientHarness();let rejoined=0,received=0;
 Object.assign(client,{epoch:3,closed:false,publisher:{connectionState:'connected'},reconnect(){rejoined++;},receive(){received++;},receiveKey:'speaker'});
 const publisher=client.publisher,receiver=client.receiver=client.pc();
 receiver.connectionState='failed';receiver.onconnectionstatechange();
 assert.equal(client.publisher,publisher);assert.equal(rejoined,0);assert.equal(client.receiveKey,null);
 timers[0]();assert.equal(received,1);
 // A retired connection cannot interrupt a newer receive transport.
 client.receiver=client.pc();receiver.onconnectionstatechange();assert.equal(timers.length,1);
});
test('receive recovery from an old room generation does not run after a rejoin',()=>{
 const {client,timers}=clientHarness();let received=0;
 Object.assign(client,{epoch:3,closed:false,receive(){received++;}});
 const receiver=client.receiver=client.pc();receiver.connectionState='failed';receiver.onconnectionstatechange();
 client.epoch++;timers[0]();assert.equal(received,0);
});
test('failed publishing transport still invokes the full recovery path',()=>{
 const {client}=clientHarness();let rejoined=0;
 Object.assign(client,{closed:false,reconnect(){rejoined++;}});
 const publisher=client.publisher=client.pc();publisher.connectionState='failed';publisher.onconnectionstatechange();
 assert.equal(rejoined,1);
});
test('cancelling microphone setup releases the busy guard for the next attempt',async()=>{
 const {client}=clientHarness();
 Object.assign(client,{micAttempt:4,micBusy:true,stopMicrophone(){},async command(){},async refresh(){},status(){}});
 await client.mute();assert.equal(client.micBusy,false);assert.equal(client.micAttempt,5);assert.equal(client.micState,'muted');
});
test('microphone cleanup immediately releases a capture awaiting audio processing',()=>{
 const {client}=clientHarness();let stopped=0;
 client.pendingStream={getTracks:()=>[{stop(){stopped++;}}]};
 client.stopMicrophone();assert.equal(stopped,1);assert.equal(client.pendingStream,null);
});
test('an obsolete microphone permission failure cannot overwrite a newer attempt',async()=>{
 let rejectPermission;
 const {client}=clientHarness({
  navigator:{mediaDevices:{getUserMedia:()=>new Promise((_,reject)=>{rejectPermission=reject;})}},
  performance:{now:()=>0}
 });
 Object.assign(client,{epoch:1,generation:'session',micAttempt:0,state:{self:'host',members:[{id:'host',seat:0}]},
  stopMicTest(){},microphoneConstraints(){return{};},paint(){},status(){}
 });
 const pending=client.enableMic();client.micAttempt++;client.micState='on';client.micBusy=false;
 rejectPermission(Object.assign(Error('Old request denied'),{name:'NotAllowedError'}));
 await pending;assert.equal(client.micState,'on');assert.equal(client.micBusy,false);
});
test('cancelled microphone setup cannot publish after ICE gathering completes',async()=>{
 const rawTrack={getSettings(){return{};},stop(){}},track={};
 const stream={getAudioTracks:()=>[rawTrack],getTracks:()=>[rawTrack]};
 let published=0,closed=0;
 const {client}=clientHarness({
  navigator:{mediaDevices:{getUserMedia:async()=>stream}},performance:{now:()=>0},
  VoiceAudio:{microphone:async()=>({stream:{getAudioTracks:()=>[track]},setReverb(){},close(){}})},
  fetch:async()=>{published++;throw Error('Unexpected stale publish');},crypto:{randomUUID:()=> 'request'}
 });
 Object.assign(client,{epoch:1,generation:'session',micAttempt:0,preferences:{preset:'radio',input:1,reverb:0},state:{self:'host',members:[{id:'host',seat:0}]},
  stopMicTest(){},microphoneConstraints(){return{};},paint(){},status(){},watchProcessing(){},startLevels(){},
  pc(){return {addTransceiver:()=>({sender:{},mid:'0'}),createOffer:async()=>({}),setLocalDescription:async()=>{},close(){closed++;}};},
  async ice(){this.micAttempt++;}
 });
 await client.enableMic();assert.equal(published,0);assert.equal(closed,1);
});

test('rapid mute/unmute reconciles the latest intent and keeps capture and publisher',async()=>{
 const {client}=clientHarness();const track={enabled:true},raw={enabled:true},pc={connectionState:'connected'};
 let resolve;const sent=[];
 Object.assign(client,{epoch:1,micAttempt:1,publisher:pc,stream:{getAudioTracks:()=>[raw]},micSender:{track},micDesired:false,paint(){},acceptState(){},
  command:async(action,input)=>{sent.push(input);if(sent.length===1)await new Promise(r=>resolve=r);return {};},
 });
 const pending=client.syncMicIntent();assert.equal(track.enabled,false);assert.equal(raw.enabled,false);
 client.micDesired=true;assert.equal(client.syncMicIntent(),pending);resolve();await pending;
 assert.equal(sent.length,2);assert.equal(sent[0].muted,true);assert.equal(sent[1].muted,false);assert.ok(sent[1].sequence>sent[0].sequence);
 assert.equal(track.enabled,true);assert.equal(raw.enabled,true);assert.equal(client.publisher,pc);assert.equal(client.micState,'on');
});
test('a late unmute response cannot enable a retired microphone',async()=>{
 const {client}=clientHarness();let resolve;const track={enabled:false};
 Object.assign(client,{epoch:1,micAttempt:1,publisher:{connectionState:'connected'},stream:{getAudioTracks:()=>[track]},micSender:{track},micDesired:true,paint(){},acceptState(){},
  command:()=>new Promise(r=>resolve=r)});
 const pending=client.syncMicIntent();client.micAttempt++;client.publisher=null;client.micDesired=false;resolve({});await pending;assert.equal(track.enabled,false);
});

test('retiring an old mute request cannot block or clear a new publisher intent',async()=>{
 const {client}=clientHarness();const releases=[],track={enabled:false,onended:null};
 Object.assign(client,{epoch:1,micAttempt:1,publisher:{connectionState:'connected',close(){}},stream:{getAudioTracks:()=>[track],getTracks:()=>[]},micSender:{track},micDesired:true,paint(){},acceptState(){},
  command:()=>new Promise(resolve=>releases.push(resolve))});
 const old=client.syncMicIntent();client.micAttempt++;client.stopMicrophone();
 Object.assign(client,{publisher:{connectionState:'connected'},stream:{getAudioTracks:()=>[track]},micSender:{track}});
 const fresh=client.syncMicIntent();assert.notEqual(old,fresh);assert.equal(releases.length,2);
 releases[0]({});await old;assert.equal(client.micSync,fresh);assert.equal(track.enabled,false);
 releases[1]({});await fresh;assert.equal(track.enabled,true);assert.equal(client.micSync,null);
});
test('prewarmed capture is deduplicated, disabled and never publishes automatically',async()=>{
 let captures=0,grant;const track={readyState:'live',enabled:true,stop(){}},stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
 const {client}=clientHarness({navigator:{mediaDevices:{getUserMedia(){captures++;return new Promise(r=>grant=r);}}}});
 Object.assign(client,{epoch:1,micAttempt:1,microphoneConstraints(){return{};}});
 const first=client.captureMicrophone(),second=client.captureMicrophone();assert.equal(captures,1);grant(stream);
 assert.equal(await first,stream);assert.equal(await second,stream);assert.equal(track.enabled,false);assert.equal(client.publisher,undefined);
});
test('permission prompt is never opened by prewarming',async()=>{
 let captures=0;const {client}=clientHarness({navigator:{permissions:{query:async()=>({state:'prompt'})},mediaDevices:{getUserMedia(){captures++;}}}});
 Object.assign(client,{generation:'g',epoch:1,micAttempt:1,state:{self:'a',members:[{id:'a',seat:1}]}});
 client.warmMicrophone();await Promise.resolve();await Promise.resolve();assert.equal(captures,0);
});
test('music searches deduplicate, cache and ignore an older query even when abort is not honored',async()=>{
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{dataset:{},value:'one',setAttribute(){}});return elements.get(id);};
 const requests=[];
 const {client}=clientHarness({AbortController,performance,Date,$:get,fetch:(_url,opts)=>new Promise(resolve=>requests.push({resolve,signal:opts.signal}))});
 Object.assign(client,{id:'room',generation:'g',epoch:1});
 const first=client.searchMusic(),duplicate=client.searchMusic();assert.equal(requests.length,1);
 get('#voice-music-query').value='two';const second=client.searchMusic();assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true);
 requests[1].resolve({ok:true,json:async()=>({tracks:[]})});await second;
 const rendered=get('#voice-music-results').innerHTML;
 requests[0].resolve({ok:true,json:async()=>({tracks:[{id:'stale'}]})});await first;await duplicate;
 assert.equal(get('#voice-music-results').innerHTML,rendered);
 await client.searchMusic();assert.equal(requests.length,2,'fresh identical result should use bounded cache');
 get('#voice-music-query').value='';await client.searchMusic();assert.equal(requests.length,2);assert.equal(get('#voice-music-results').innerHTML,'');
});

test('a next song waits for prior publication cleanup without unmuting or allocating twice',async()=>{
 let requests=0;const waits=[];
 const context=nicknameContext({setTimeout(fn,delay){waits.push(delay);queueMicrotask(fn);},fetch:async()=>({ok:++requests>2,status:409,json:async()=>requests>2?{sessionDescription:{type:'answer'}}:{error:'이전 송출 연결을 정리하고 있어요. 잠시 후 다시 켜주세요.'}})});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8'),context);
 const client={path:x=>x,micDesired:true,setMicPhase:()=>{}};
 const result=await context.publishAfterCleanup(client,{mid:'0'},()=>false);
 assert.equal(result.sessionDescription.type,'answer');assert.equal(requests,3);assert.deepEqual(waits,[1000,1500]);
 requests=0;client.micDesired=true;
 client.setMicPhase=()=>{client.micDesired=false;};
 assert.equal(await context.publishAfterCleanup(client,{mid:'0'},()=>false),null);assert.equal(requests,1,'muting cancels a pending retry');
 requests=0;client.micDesired=true;client.setMicPhase=()=>{};
 context.fetch=async()=>({ok:false,status:409,json:async()=>({error:'이미 연결 중인 마이크예요.'})});
 await assert.rejects(()=>context.publishAfterCleanup(client,{},()=>false),/이미 연결/);
});
