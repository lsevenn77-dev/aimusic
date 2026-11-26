import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SoundTouch} from '@soundtouchjs/core';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';

test('stored gold/silver song receipts survive reload, count once and use the purchased gift split',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Singer',0);INSERT INTO users(id,email,name,created) VALUES('fan','fan@example.test','Fan',0);INSERT INTO producers(id,user_id,name,created) VALUES('fan-profile','fan','Fan',0);UPDATE tracks SET user_id='other',producer_id='friend',kind='cover',original_id='one' WHERE id='two';INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('funds','owner','web',500,5000,0,'paid',0,1);INSERT INTO free_gift_wallets VALUES('owner',100)");
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one';UPDATE gold_purchases SET user_id='fan';UPDATE free_gift_wallets SET user_id='fan'");
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('fan'),'fan',Math.floor(Date.now()/1000)+3600);
 const call=(path,method='GET',body,uid='fan')=>f.call(path,method,body,uid);
 const send=async type=>{
  const bought=await call('/api/me/gift-inventory/buy','POST',{gift_type:type,quantity:1,request_id:crypto.randomUUID()});
  assert.equal(bought.status,201,JSON.stringify(bought.body));
  const item=bought.body.items.find(i=>i.gift_type===type),path='/api/me/gift-inventory/'+item.id+'/send',body={profile_id:'friend',track_id:'two',request_id:crypto.randomUUID()};
  const sent=await call(path,'POST',body);assert.equal(sent.status,200,JSON.stringify(sent.body));
  assert.equal((await call(path,'POST',body)).status,200);
  assert.equal((await call(path,'POST',{...body,track_id:'one'})).status,409);
  assert.ok(!(await call('/api/me/gift-inventory')).body.items.some(i=>i.id===item.id));
  return item;
 };
 const paid=await send('heart'),free=await send('silver-letter');
 const gift=f.sql.prepare('SELECT * FROM gifts WHERE id=?').get(paid.id);
 assert.equal(gift.track_id,'two');assert.equal(gift.singer_profile_id,'friend');assert.equal(gift.creator_profile_id,'producer');
 const normal=await call('/api/tracks/two/gifts','POST',{gift_type:'heart',request_id:crypto.randomUUID()});
 assert.equal(normal.status,201,JSON.stringify(normal.body));
 const purchased=f.sql.prepare('SELECT * FROM gifts WHERE id=?').get(normal.body.gift.id);
 for(const field of ['singer_mw','creator_mw','platform_mw','net_mw'])assert.equal(gift[field],purchased[field],field);
 const summary=(await f.call('/api/tracks/two/gifts')).body;
 assert.equal(summary.total_gold,paid.value*2);assert.equal(summary.free_count,free.value);assert.equal(summary.gift_count,2);
 assert.deepEqual((await f.call('/api/tracks/two/gifts')).body,summary);
 const history=await call('/api/gifts/sent');assert.equal(history.status,200,JSON.stringify(history.body));
 assert.equal(history.body.items.length,3);assert.equal(new Set(history.body.items.map(i=>i.currency+':'+i.id)).size,3);
 assert.ok(history.body.items.every(i=>i.target_type==='work'&&i.target_id==='two'&&i.target_name==='two'));
 assert.equal((await f.call('/api/gifts/sent','GET',undefined,'other')).body.items.length,0);
 assert.equal((await f.call('/api/gifts/sent','GET',undefined,null)).status,401);
 assert.equal((await f.call('/api/gifts/sent?offset=-1')).status,400);
});

test('reservation replacement moves to the tail, enforces singer exclusion and ends through the same real bridge',async t=>{
 const f=await liveFixture(t),r=await f.create(),other=await f.join(r);f.addSong('replacement');
 await f.command(r,r.state,'request',{track_id:'one'});
 const firstRequest=crypto.randomUUID();await f.command(r,other,'request',{track_id:'one',request_id:firstRequest},'other');
 r.room.data.members.third={...r.room.data.members.other,id:'third',generation:'third',seat:null};
 r.room.data.karaoke.queue.push({user_id:'third',name:'Third',request_id:'third-request',track:{id:'one',title:'One',artist:'A',duration:120}});
 const rid=crypto.randomUUID(),replaced=await f.command(r,other,'request',{track_id:'replacement',request_id:rid},'other');
 assert.equal(replaced.status,200,JSON.stringify(replaced.body));
 assert.deepEqual(replaced.body.karaoke.queue.map(q=>q.user_id),['third','other']);
 assert.equal(replaced.body.karaoke.queue.at(-1).track.id,'replacement');
 await f.command(r,other,'request',{track_id:'replacement',request_id:rid},'other');
 assert.equal(r.room.data.karaoke.queue.filter(q=>q.user_id==='other').length,1);
 await f.command(r,other,'request',{track_id:'one',request_id:firstRequest},'other');
 assert.equal(r.room.data.karaoke.queue.at(-1).track.id,'replacement','a delayed retry cannot undo a newer reservation');
 assert.equal((await f.command(r,r.state,'request',{track_id:'replacement'})).status,409);
 const turn=r.room.data.karaoke.active.invitation_id;
 for(const key of [-8,8,0])assert.equal((await f.command(r,r.state,'key',{key,invitation_id:turn})).status,200);
 for(const key of [-9,9,1.5])assert.equal((await f.command(r,r.state,'key',{key,invitation_id:turn})).status,400);
 assert.equal((await f.command(r,other,'key',{key:2,invitation_id:turn},'other')).status,403);
 const down=await f.call(r.root+'release-mic','POST',{generation:r.state.generation,invitation_id:turn});
 assert.equal(down.status,200,JSON.stringify(down.body));assert.equal(down.body.karaoke.active.user_id,'third');
 assert.equal(r.room.data.members.owner.seat,null);assert.equal(r.room.data.members.owner.pub,null);
 assert.equal((await f.call(r.root+'release-mic','POST',{generation:r.state.generation,invitation_id:turn})).status,200);
 assert.equal(r.room.data.karaoke.active.user_id,'third','old self release never ends another singer');
});

test('both talk host and participant can release only their own seat; state is persisted',async t=>{
 const f=await liveFixture(t),r=await f.create({mode:'talk',seating_mode:'free'}),other=await f.join(r);
 await f.call(r.root+'request-mic','POST',{generation:other.generation,seat:1},'other');
 const down=await f.call(r.root+'release-mic','POST',{generation:other.generation,target_id:'owner'},'other');
 assert.equal(down.status,200);assert.equal(r.room.data.members.other.seat,null);assert.equal(r.room.data.members.owner.seat,0);
 assert.equal((await f.call(r.root+'release-mic','POST',{generation:r.state.generation})).status,200);
 assert.equal(r.room.data.members.owner.seat,null);
 const read=await f.call(r.root+'state');assert.ok(read.body.members.every(m=>m.seat===null));
});

function worklet(rate=48000){
 let Processor;
 const c=vm.createContext({SoundTouch,sampleRate:rate,Float32Array,Math,Number,AudioWorkletProcessor:class {constructor(){this.port={postMessage(){}};}},registerProcessor(_name,p){Processor=p;}});
 vm.runInContext(readFileSync('shared/room-backing-worklet.js','utf8').replace(/^import .*;\r?\n/,''),c);
 return new Processor();
}
test('real SoundTouch worklet preserves duration and pitch across all -8..+8 keys without steady-state underruns',()=>{
 for(const key of Array.from({length:17},(_,i)=>i-8)){
  const p=worklet(),input=[new Float32Array(128),new Float32Array(128)],out=[new Float32Array(128),new Float32Array(128)];
  p.port.onmessage({data:key});let crossings=0,previous=0,empty=0;
  for(let block=0;block<1125;block++){
   for(let i=0;i<128;i++)input[0][i]=input[1][i]=.4*Math.sin(2*Math.PI*440*(block*128+i)/48000);
   out.forEach(a=>a.fill(0));p.process([input],[out]);
   if(block<375)continue;
   if(out[0].every(v=>v===0))empty++;
   for(const v of out[0]){assert.ok(Number.isFinite(v));if(previous<=0&&v>0)crossings++;previous=v;}
  }
  assert.equal(empty,0,'silent blocks at key '+key);
  const frequency=crossings/2,expected=440*2**(key/12);
  assert.ok(Math.abs(frequency-expected)/expected<.025,key+': '+frequency+' vs '+expected);
 }
});
test('rapid keys collapse to the final target without resetting the audio buffer',()=>{
 const p=worklet();p.port.onmessage({data:1});p.port.onmessage({data:2});p.port.onmessage({data:8});
 p.engine.clear=()=>{throw Error('key change must not discard audio');};
 const i=[new Float32Array(128),new Float32Array(128)],o=[new Float32Array(128),new Float32Array(128)];
 p.process([i],[o]);assert.equal(p.key,8);p.port.onmessage({data:9});p.process([i],[o]);assert.equal(p.key,8);
});

test('continuous audio survives repeated jumps between all pitch extremes',()=>{
 const p=worklet(),input=[new Float32Array(128),new Float32Array(128)],out=[new Float32Array(128),new Float32Array(128)];
 const keys=[0,8,-8,3,-3,7,-7,0];let silent=0;
 for(let block=0;block<3000;block++){
  if(block%150===0)p.port.onmessage({data:keys[Math.floor(block/150)%keys.length]});
  for(let i=0;i<128;i++)input[0][i]=input[1][i]=.3*Math.sin(2*Math.PI*440*(block*128+i)/48000);
  out.forEach(a=>a.fill(0));p.process([input],[out]);
  if(block>375&&out[0].every(v=>v===0))silent++;
  assert.ok(out[0].every(v=>Number.isFinite(v)&&Math.abs(v)<1));
 }
 assert.equal(silent,0,'continuous pitch edits must not create silent render blocks');
});
