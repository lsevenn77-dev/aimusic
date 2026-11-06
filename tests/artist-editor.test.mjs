import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';

const context=nicknameContext({document:{addEventListener(){}}});
vm.runInContext(readFileSync('dist/artist-directory.js','utf8'),context);
const change=(ids,id,action)=>Array.from(context.directoryPinChange(ids,id,action));
test('pin drafts preserve order, enforce the limit, and leave saved IDs untouched',()=>{
 const original=['a','b','c'];
 assert.deepEqual(change(original,'c','up'),['a','c','b']);
 assert.deepEqual(change(original,'a','up'),original);
 assert.deepEqual(change(original,'b','remove'),['a','c']);
 assert.deepEqual(change(['a','c'],'b','add'),['a','c','b']);
 assert.deepEqual(change(original,'b','add'),original);
 assert.throws(()=>change(original,'d','add'),/최대 3명/);
 assert.deepEqual(original,['a','b','c']);
});
test('profile and ordered pins survive fresh reads; limits and ownership stay enforced',async t=>{
 const f=await fixture(t);
 for(const id of ['a2','a3','a4'])f.sql.prepare('INSERT INTO artists(id,producer_id,name,created) VALUES(?,?,?,0)').run(id,'producer',id);
 const profile=await f.call('/api/studio/artists/artist','PUT',{name:'수정 검증',bio:'소개 수정',genre:'직접 입력 장르'});
 assert.equal(profile.status,200);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['a3','artist','a2']})).status,200);
 const studio=await f.call('/api/studio');const artist=studio.body.artists.find(a=>a.id==='artist');
 assert.equal(artist.name,'수정 검증');assert.equal(artist.bio,'소개 수정');assert.equal(artist.genre,'직접 입력 장르');
 assert.deepEqual((await f.call('/api/producers/producer/pinned-artists')).body.ids,['a3','artist','a2']);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['a3','artist','a2','a4']})).status,400);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:[]},'other')).status,403);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['artist','a2']})).status,200);
 assert.deepEqual((await f.call('/api/producers/producer/pinned-artists')).body.ids,['artist','a2']);
});
