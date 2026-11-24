import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {playlistsRoute} from '../server/playlists.js';

const audio={kind:'original',content_id:'one'},cover={kind:'cover',content_id:'two'},dubbing={kind:'dubbing',content_id:'one'};
function works(sql) {
 sql.exec("UPDATE tracks SET kind='cover' WHERE id='two'; INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,role_count,duration,write_token,created,updated) VALUES('one','owner','더빙','{}','{}','','',1,30,'local-test',0,0)");
}

test('public conversion is atomic; original and dubbing IDs coexist and bookmark permissions are rechecked',async t=>{
 const {call,sql}=await fixture(t);works(sql);
 const create=await call('/api/playlists','POST',{name:'First Mix',is_public:true,items:[audio]});assert.equal(create.status,201);
 const path='/api/playlists/'+create.body.id;
 assert.equal((await call(path+'/save','PUT',null,'other')).status,200);
 const request={...dubbing,revision:1};
 const canceled=await call(path+'/items','PUT',request);assert.equal(canceled.status,409);
 assert.equal(canceled.body.error,'커버곡 또는 더빙을 추가하면 플레이리스트가 비공개로 변경됩니다. 계속하시겠습니까?');
 assert.equal((await call(path,'GET',null,'other')).body.playlist.is_public,1);
 assert.equal((await call(path+'/items','PUT',{...request,confirm_private:true})).status,200);
 assert.equal((await call(path+'/items','PUT',cover)).status,200);
 assert.deepEqual((await call(path)).body.items.map(i=>i.kind),['original','dubbing','cover']);
 assert.equal((await call(path,'GET',null,'other')).status,404);
 assert.equal((await call('/api/search?q=Mix','GET',null,'other')).body.playlists.length,0);
 assert.equal((await call('/api/playlists?home=1','GET',null,'other')).body.playlists.length,0);
 assert.equal((await call('/api/me/music-library?section=playlists&q=Mix','GET',null,'other')).body.total,0);
 assert.equal((await call(path,'PATCH',{is_public:true})).status,400);
 const duplicate=await call('/api/playlists','POST',{name:'ＦＩＲＳＴ　ＭＩＸ',items:[]},'other');assert.equal(duplicate.status,201);
 assert.equal((await call(path+'/order','PUT',{items:[dubbing,cover,audio]})).status,200);
 assert.deepEqual((await call(path)).body.items.map(i=>i.kind),['dubbing','cover','original']);
 assert.equal((await call(path+'/items','DELETE',cover)).status,200);
 assert.equal((await call(path+'/items','DELETE',dubbing)).status,409);
 assert.deepEqual((await call(path)).body.items.map(i=>i.kind),['dubbing','original']);
 assert.equal((await call(path+'/items','DELETE',{...dubbing,name:'내 편집본'})).status,200);
 assert.equal((await call(path)).body.playlist.is_public,0);
 assert.equal((await call(path,'PATCH',{is_public:true})).status,200);
 assert.equal((await call(path,'GET',null,'other')).body.playlist.name,'내 편집본');
});

test('fork with a cover uses the original title, commits the edit and unbookmark once, and isolates the source image',async t=>{
 const files=new Map([['images/playlist/source/art','image']]);
 const BUCKET={async get(k){return files.has(k)?{body:files.get(k)}:null;},async put(k,v){files.set(k,v);},async delete(k){files.delete(k);}};
 const {call,sql}=await fixture(t,{BUCKET});works(sql);
 const original=(await call('/api/playlists','POST',{name:'공유',items:[audio],is_public:true})).body.id,path='/api/playlists/'+original;
 files.set('images/playlist/'+original+'/art','source-image');
 sql.prepare("UPDATE playlists SET image_version='art',image_type='image/webp' WHERE id=?").run(original);
 await call(path+'/save','PUT',null,'other');
 const body={name:'공유',items:[audio,cover],source_revision:1,request_id:'mixed-fork'};
 const copy=await call(path+'/fork','POST',body,'other');assert.equal(copy.status,201);
 const replay=await call(path+'/fork','POST',body,'other');assert.equal(replay.body.id,copy.body.id);
 const fork=(await call('/api/playlists/'+copy.body.id,'GET',null,'other')).body;
 assert.deepEqual(fork.items.map(i=>i.kind),['original','cover']);assert.equal(fork.playlist.is_public,0);
 assert.equal(files.get('images/playlist/'+copy.body.id+'/'+fork.playlist.image_version),'source-image');
 assert.equal((await call(path)).body.playlist.image_version,'art');
 assert.equal((await call(path)).body.items.length,1);assert.equal(sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,0);
});

test('revoked dubbing cannot be added in a transaction after preflight and archived items survive metadata edits',async t=>{
 const f=await fixture(t);works(f.sql);
 const pid=(await f.call('/api/playlists','POST',{name:'내 목록',items:[audio]})).body.id,path='/api/playlists/'+pid;
 const DB={...f.DB,async batch(stmts){f.sql.exec("UPDATE dubbing_projects SET deleted_at=1 WHERE id='one'");return f.DB.batch(stmts);}};
 const req=new Request('https://test'+path+'/items',{method:'PUT',body:JSON.stringify(dubbing)});
 await assert.rejects(playlistsRoute(req,{DB},path+'/items',{id:'owner'}),e=>e.status===409);
 f.sql.prepare("INSERT INTO playlist_extra_items(playlist_id,kind,content_id,position,created) VALUES(?,'cover','removed',99,2)").run(pid);
 assert.equal((await f.call(path,'PATCH',{description:'소개'})).status,200);
 const archived=(await f.call(path)).body.items.at(-1);assert.equal(archived.content_id,'removed');assert.equal(archived.available,false);
 assert.equal((await f.call(path,'PATCH',{is_public:true})).status,400);
});

test('deleting a content owner keeps typed unavailable covers and privatizes an emptied public list',async t=>{
 const {call,sql}=await fixture(t);works(sql);
 const published=(await call('/api/playlists','POST',{name:'공개',items:[audio],is_public:true},'other')).body.id;
 const mixed=(await call('/api/playlists','POST',{name:'공개',items:[cover]},'other')).body.id;
 assert.equal((await call('/api/account/delete','POST',{confirmation:'DELETE'})).status,200);
 const deletedTrack=(await call('/api/playlists/'+mixed,'GET',null,'other')).body.items[0];
 assert.equal(deletedTrack.kind,'cover');assert.equal(deletedTrack.available,false);
 assert.equal((await call('/api/playlists/'+published,'GET',null,null)).status,404);
 assert.equal((await call('/api/playlists/'+mixed+'/items','DELETE',cover,'other')).status,409);
});

test('legacy request retries preserve the original fingerprint when a reference disappears',async t=>{
 const {call,sql}=await fixture(t);
 const body={name:'변경 전 요청',track_ids:['three'],request_id:'previous-id',description:' 소개 '};
 const created=await call('/api/playlists','POST',body);
 sql.exec("DELETE FROM tracks WHERE id='three'");
 const replayed=await call('/api/playlists','POST',body);
 assert.equal(replayed.body.replayed,true);assert.equal(replayed.body.id,created.body.id);
 assert.equal((await call('/api/playlists','POST',{...body,name:'다른 요청'})).status,409);
});
