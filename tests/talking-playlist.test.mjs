import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {liveFixture} from './live-karaoke-fixture.mjs';

test('desktop list distinguishes unavailable and empty snapshots and preserves transport order/selection while paused',()=>{
 const context=vm.createContext({VoiceRoomClient:class{}});
 vm.runInContext(readFileSync(new URL('../dist/talking-playlist.js',import.meta.url),'utf8'),context);
 assert.equal(context.talkingPlaylistItems(null),null);
 assert.equal(context.talkingPlaylistItems({}),null);
 const music={queue:[{id:'second'},{id:'first'}],index:1,playing:false,position:42};
 const before=JSON.stringify(music),rows=context.talkingPlaylistItems(music);
 assert.equal(rows.map(row=>row.track.id).join(','),'second,first');
 assert.equal(rows.filter(row=>row.current).length,1);
 assert.equal(rows.find(row=>row.current).track.id,'first');
 assert.equal(JSON.stringify(music),before);
 assert.equal(context.talkingPlaylistItems({queue:[],index:-1}).length,0);
});

test('participant likes and personal saves stay private and do not change room order, transport or host permissions',async t=>{
 const f=await liveFixture(t),r=await f.create({mode:'talk'}),guest=await f.join(r);
 await f.call(r.root+'music-consent','POST',{generation:r.state.generation,track_id:'one',accept:true});
 const enqueue=await f.call(r.root+'music','POST',{generation:r.state.generation,operation:'enqueue',track_id:'one',request_id:crypto.randomUUID()});
 assert.equal(enqueue.status,200);
 const before=(await f.call(r.root+'state')).body.music;
 assert.equal((await f.call('/api/tracks/one/like','PUT',{},'other')).status,200);
 const playlist=await f.call('/api/playlists','POST',{name:'Personal test',is_public:false},'other');
 assert.ok(playlist.body.id);
 assert.equal((await f.call('/api/playlists/'+playlist.body.id+'/tracks/one','PUT',{},'other')).status,200);
 const hostLibrary=(await f.call('/api/library')).body,guestLibrary=(await f.call('/api/library','GET',undefined,'other')).body;
 assert.equal(hostLibrary.likes.some(track=>track.id==='one'),false);
 assert.equal(guestLibrary.likes.some(track=>track.id==='one'),true);
 assert.equal(hostLibrary.playlists.some(list=>list.id===playlist.body.id),false);
 assert.equal(guestLibrary.playlists.find(list=>list.id===playlist.body.id).tracks,1);
 const after=(await f.call(r.root+'state')).body.music;
 assert.deepEqual(after,before);
 assert.equal((await f.call(r.root+'music','POST',{generation:guest.generation,operation:'play',request_id:crypto.randomUUID()},'other')).status,403);
});
