import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function clientHarness(extra={}){
 const timers=[];
 const context=vm.createContext({
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
