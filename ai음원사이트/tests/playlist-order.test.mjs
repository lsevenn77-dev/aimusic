import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('playlist selection saves atomically with privacy and persistent playback order',async t=>{
 const {call,sql}=await fixture(t);
 const created=await call('/api/playlists','POST',{name:'우울할 때',track_ids:['three','one','two']});assert.equal(created.status,201);const path='/api/playlists/'+created.body.id;
 const ids=async()=> (await call(path)).body.tracks.map(x=>x.id);
 assert.deepEqual(await ids(),['three','one','two']);
 assert.equal((await call(path,'GET',null,null)).status,404);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','two','three']},'other')).status,403);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','one','three']})).status,400);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','three']})).status,409);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','hidden','three']})).status,409);
 assert.deepEqual(await ids(),['three','one','two']);
 assert.equal((await call(path+'/order','PUT',{track_ids:['two','three','one']})).status,200);
 assert.deepEqual(await ids(),['two','three','one']);
 assert.equal((await call(path+'/tracks/three','DELETE')).status,200);
 assert.equal((await call(path+'/tracks/three','PUT')).status,200);
 assert.deepEqual(await ids(),['two','one','three']);
 assert.equal((await call(path+'/tracks/one','PUT')).status,200);assert.deepEqual(await ids(),['two','one','three']);
 assert.equal((await call(path,'PATCH',{name:'기분 업',is_public:true})).status,200);
 assert.equal((await call(path,'GET',null,null)).body.playlist.name,'기분 업');
 assert.deepEqual((await call(path,'GET',null,null)).body.tracks.map(x=>x.id),['two','one','three']);
 for(const track_ids of [['one','hidden'],['one','missing'],['one','one']])assert.ok((await call('/api/playlists','POST',{name:'Invalid',track_ids})).status>=400);
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
});

test('reordering published songs retains hidden members and their relative slots',async t=>{
 const {call,sql}=await fixture(t);const created=await call('/api/playlists','POST',{name:'밤 드라이브',track_ids:['one','two','three']});const pid=created.body.id,path='/api/playlists/'+pid;
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='two'");
 assert.equal((await call(path+'/order','PUT',{track_ids:['three','one']})).status,200);
 assert.deepEqual(sql.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(pid).map(x=>x.track_id),['three','two','one']);
 sql.exec("UPDATE tracks SET status='published' WHERE id='two'");
 assert.deepEqual((await call(path)).body.tracks.map(x=>x.id),['three','two','one']);
});

test('public playlist discovery and bookmarks respect privacy, ownership, publication and idempotency',async t=>{
 const {call,sql}=await fixture(t);sql.exec("UPDATE tracks SET duration=90 WHERE id='one'");
 const a=await call('/api/playlists','POST',{name:'공개 드라이브',description:'밤의 산책',is_public:true,track_ids:['one']});const pid=a.body.id,path='/api/playlists/'+pid;
 await call('/api/playlists','POST',{name:'비밀 드라이브',track_ids:['two']});
 assert.equal((await call('/api/playlists','GET',null,null)).body.playlists.length,1);
 assert.equal((await call(path+'/save','PUT',null,null)).status,401);
 assert.equal((await call(path+'/save','PUT')).status,400);
 for(let i=0;i<2;i++)assert.equal((await call(path+'/save','PUT',null,'other')).status,200);
 let d=(await call('/api/library','GET',null,'other')).body;assert.equal(d.saved.length,1);assert.equal(d.saved[0].duration,90);assert.equal(d.saved[0].covers[0].id,'one');assert.equal(d.saved[0].description,'밤의 산책');
 assert.equal((await call(path,'PATCH',{name:'변경된 제목',description:'소개 변경',is_public:true},'other')).status,403);
 await call(path+'/tracks/two','PUT');assert.equal((await call(path,'GET',null,'other')).body.tracks.length,2);
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");d=(await call(path,'GET',null,'other')).body;assert.equal(d.playlist.tracks,1);assert.equal(d.playlist.covers.length,1);assert.equal(d.playlist.covers[0].id,'two');
 await call(path,'PATCH',{name:'이제 비공개',is_public:false});
 assert.equal((await call(path,'GET',null,'other')).status,404);assert.equal((await call('/api/library','GET',null,'other')).body.saved.length,0);assert.equal((await call('/api/playlists','GET',null,null)).body.playlists.length,0);
 assert.equal((await call(path+'/save','PUT',null,'other')).status,404);assert.equal((await call(path+'/save','DELETE',null,'other')).status,200);
});

test('library playlist pin and custom order persist per account and reject foreign memberships',async t=>{
 const {call,sql}=await fixture(t);sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");const ids=[];for(const name of ['목록 1','목록 2','목록 3'])ids.push((await call('/api/playlists','POST',{name,is_public:true,track_ids:['one']})).body.id);
 assert.equal((await call('/api/library/playlists/'+ids[0],'PATCH',{pinned:true},'other')).status,404);
 assert.equal((await call('/api/library/playlists/'+ids[0],'PATCH',{pinned:'true'})).status,400);
 assert.equal((await call('/api/library/playlists/order','PUT',{playlist_ids:[ids[0],ids[1]]})).status,409);
 assert.equal((await call('/api/library/playlists/order','PUT',{playlist_ids:[ids[0],ids[0],ids[1]]})).status,400);
 await call('/api/library/playlists/order','PUT',{playlist_ids:[ids[2],ids[1],ids[0]]});
 assert.deepEqual((await call('/api/library')).body.collections.map(p=>p.id),[ids[2],ids[1],ids[0]]);
 await call('/api/library/playlists/'+ids[0],'PATCH',{pinned:true});assert.equal((await call('/api/library')).body.collections[0].id,ids[0]);
 await call('/api/playlists/'+ids[1]+'/save','PUT',null,'other');await call('/api/library/playlists/'+ids[1],'PATCH',{pinned:true},'other');
 assert.equal((await call('/api/library')).body.collections.find(p=>p.id===ids[1]).pinned,0);
 await call('/api/library/playlists/'+ids[0],'PATCH',{pinned:false});assert.deepEqual((await call('/api/library')).body.collections.map(p=>p.id),[ids[2],ids[1],ids[0]]);
});

test('mood discovery uses actual tags and following/search return only public matching content',async t=>{
 const {call,sql}=await fixture(t);sql.exec("UPDATE tracks SET tags='집중, lo-fi' WHERE id='one'; UPDATE tracks SET tags='기분 업' WHERE id='two'; UPDATE artists SET name='한빛'; UPDATE producers SET name='달빛'");
 let d=(await call('/api/discovery?mood=focus','GET',null,null)).body;assert.deepEqual(d.tracks.map(t=>t.id),['one']);assert.equal(d.moods.find(m=>m.id==='focus').count,1);assert.equal(d.moods.find(m=>m.id==='sleep').count,0);
 assert.equal((await call('/api/discovery?mood=invalid')).status,400);assert.equal((await call('/api/discovery?following=1','GET',null,null)).status,401);
 assert.equal((await call('/api/discovery?following=1')).body.tracks.length,0);await call('/api/artists/artist/follow','PUT');assert.equal((await call('/api/discovery?following=1')).body.tracks.length,3);
 await call('/api/playlists','POST',{name:'찾는 목록',description:'독서용',is_public:true,track_ids:['one']});await call('/api/playlists','POST',{name:'찾는 비밀',description:'독서용',track_ids:['two']});
 d=(await call('/api/search?q='+encodeURIComponent('한빛'),'GET',null,null)).body;assert.equal(d.artists.length,1);assert.equal(d.producers.length,0);assert.equal(d.tracks.length,3);
 d=(await call('/api/search?q='+encodeURIComponent('독서용'),'GET',null,null)).body;assert.equal(d.playlists.length,1);assert.equal(d.playlists[0].name,'찾는 목록');
 assert.equal((await call('/api/search?q=hidden','GET',null,null)).body.tracks.length,0);
 assert.equal((await call('/api/search','GET',null,null)).body.tracks.length,0);
});
