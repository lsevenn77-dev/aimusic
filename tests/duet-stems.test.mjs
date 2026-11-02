import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
test('separate tracks require a complete pair, a joinable invitation and a signed-in partner',async t=>{
 const objects=new Map(),bucket={head:async k=>objects.has(k)?{size:objects.get(k).length}:null,get:async k=>({body:objects.get(k)})};
 const f=await fixture(t,{BUCKET:bucket});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=6 WHERE id='one';INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','job','ready',1,'ready','[]',0,0);");
 const invitation=await (await f.call('/api/covers','POST',{original_id:'one',cover_mode:'duet',duet_consent:true,rights:true,own_voice:true,extension:'mp3',bytes:1024})).body;const id=invitation.id;assert.ok(id);
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(id);
 const base='/api/duets/'+id,info=async()=>(await f.call(base,'GET',null,'other')).body;
 objects.set('karaoke/'+id+'/duet-partner.mp3',new Uint8Array([1,2,3]));assert.equal((await info()).duet.stems,undefined);
 objects.set('karaoke/'+id+'/duet-instrument.mp3',new Uint8Array([4,5,6]));
 assert.deepEqual((await info()).duet.stems,{instrument:base+'/instrument',partner:base+'/partner'});
 const read=await worker.fetch(new Request('https://aifect.test'+base+'/partner',{headers:{cookie:'aifect_session=other'}}),{DB:f.DB,BUCKET:bucket},{waitUntil(){}});assert.equal(read.status,200);assert.deepEqual([...new Uint8Array(await read.arrayBuffer())],[1,2,3]);
 assert.equal((await f.call(base+'/partner','GET',null,null)).status,401);
 f.sql.prepare('UPDATE tracks SET duet_open=0 WHERE id=?').run(id);
 assert.equal((await f.call(base+'/partner','GET',null,'other')).status,404);
});
