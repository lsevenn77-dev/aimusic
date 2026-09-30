import test from 'node:test';
import assert from 'node:assert/strict';
import {roomGain,restoreRoomMix,RoomReverb,roomImpulse} from '../shared/room-reverb.js';

test('100 is previous 50 wet gain; every percent is distinct and no dry attenuation is implied',()=>{
 assert.equal(roomGain(1),.5);assert.equal(roomGain(.1),.05);assert.equal(roomGain(0),0);assert.equal(roomGain(NaN),0);
 let previous=-1;for(let n=0;n<=100;n++){assert.ok(roomGain(n/100)>previous);previous=roomGain(n/100);}
});
test('legacy draft room scales migrate exactly once without changing other mix values',()=>{
 const legacy={room:.16,echo:.3,noise:2,voice:1.2},next=restoreRoomMix(legacy);
 assert.deepEqual(next,{...legacy,room:.32,roomScaleVersion:2});assert.deepEqual(restoreRoomMix(next),next);
 assert.equal(restoreRoomMix({room:.5}).room,1);assert.equal(restoreRoomMix({room:.65}).room,1);assert.equal(legacy.room,.16);
});
test('room reflections leave the initial vocal clear, have a diffuse finite tail and decay',()=>{
 for(const rate of [32000,48000]){const impulse=roomImpulse(rate),wet=new RoomReverb(rate);let energy=0,tail=0,count=0;
  for(let i=0;i<impulse.length;i++){assert.ok(Number.isFinite(impulse[i]));assert.ok(Math.abs(impulse[i]-wet.process(i===0?1:0))<1e-6);if(i<rate*.04)assert.equal(impulse[i],0);if(Math.abs(impulse[i])>1e-6)count++;energy+=impulse[i]**2;if(i>rate*2.5)tail+=impulse[i]**2;}
  assert.ok(count>rate*.1);assert.ok(energy>0);assert.ok(tail<energy*.00001);
 }
});
