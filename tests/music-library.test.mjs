import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=readFileSync(new URL('../dist/music-library.js',import.meta.url),'utf8');

test('private library requires authentication, validates categories and does not invent saved or downloaded records',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/me/music-library','GET',null,null)).status,401);
 assert.equal((await f.call('/api/me/music-library?section=uploads')).status,400);
 assert.equal((await f.call('/api/me/music-library','POST')).status,405);
 const r=await f.call('/api/me/music-library');assert.equal(r.status,200);
 assert.deepEqual(r.body.capabilities,{saved:false,downloads:false});assert.equal(r.body.counts.saved,null);assert.deepEqual(r.body.items,[]);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('track_saves','download_history')").get().n,0);
});
test('counts are unfiltered totals; paging, search and liked dates use the existing account records',async t=>{
 const f=await fixture(t);
 for(let i=0;i<18;i++){
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published')").run('track'+i,'음악 '+String(i).padStart(2,'0'));
  f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,?)").run('track'+i,100+i);
 }
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','hidden',1000),('other','one',1001)");
 const first=(await f.call('/api/me/music-library?section=likes')).body;
 assert.equal(first.counts.likes,18);assert.equal(first.total,18);assert.equal(first.items.length,12);assert.equal(first.nextOffset,12);assert.equal(first.items[0].id,'track17');assert.equal(first.items[0].library_at,117);assert.ok(first.items.every(t=>t.liked));
 const last=(await f.call('/api/me/music-library?section=likes&offset=12')).body;assert.equal(last.items.length,6);assert.equal(last.nextOffset,null);assert.equal(new Set([...first.items,...last.items].map(x=>x.id)).size,18);
 const search=(await f.call('/api/me/music-library?section=likes&q=音楽')).body;assert.equal(search.total,0);assert.equal(search.counts.likes,18);
 const oldest=(await f.call('/api/me/music-library?section=likes&sort=oldest&limit=1')).body;assert.equal(oldest.items[0].id,'track0');
 const other=(await f.call('/api/me/music-library?section=likes','GET',null,'other')).body;assert.equal(other.counts.likes,1);assert.equal(other.items[0].id,'one');
 await f.call('/api/tracks/track17/like','DELETE');assert.equal((await f.call('/api/me/music-library?section=likes')).body.counts.likes,17);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,22);
});
test('history is unique per visible song and sorted by actual last listen, with no cross-account leakage',async t=>{
 const f=await fixture(t);
 for(const [id,uid,tid,started] of [['a','owner','one',10],['b','owner','one',50],['c','owner','two',20],['d','other','three',99],['e','owner','hidden',100]])f.sql.prepare('INSERT INTO listens(id,listener,user_id,track_id,started,day) VALUES(?,?,?,?,?,?)').run(id,uid,uid,tid,started,'2026-10-26');
 const r=(await f.call('/api/me/music-library?section=history')).body;assert.equal(r.counts.history,2);assert.deepEqual(r.items.map(t=>[t.id,t.library_at]),[['one',50],['two',20]]);assert.equal(r.items[0].liked,false);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM listens').get().n,5);
});
test('owned and saved playlists retain existing editing, visibility, tracks and save permissions',async t=>{
 const f=await fixture(t);
 const mine=(await f.call('/api/playlists','POST',{name:'내 목록',is_public:false,track_ids:['one','two']})).body;
 const publicList=(await f.call('/api/playlists','POST',{name:'친구 공개',is_public:true,track_ids:['three']},'other')).body;
 const privateList=(await f.call('/api/playlists','POST',{name:'친구 비공개',is_public:false},'other')).body;
 const id=mine.id,publicId=publicList.id;
 assert.ok(id&&publicId,JSON.stringify([mine,publicList]));
 assert.equal((await f.call('/api/playlists/'+publicId+'/save','PUT')).status,200);
 assert.equal((await f.call('/api/playlists/'+privateList.id+'/save','PUT')).status,404);
 const all=(await f.call('/api/me/music-library?section=playlists')).body;assert.equal(all.counts.playlists,2);assert.equal(all.items.length,2);
 assert.equal((await f.call('/api/me/music-library?section=playlists&filter=mine')).body.total,1);
 assert.equal((await f.call('/api/me/music-library?section=playlists&filter=saved&q=친구')).body.total,1);
 assert.equal((await f.call('/api/playlists/'+id)).body.tracks.length,2);
 assert.equal((await f.call('/api/playlists/'+id,'PATCH',{name:'수정한 목록',is_public:true})).status,200);
 assert.equal((await f.call('/api/me/music-library?section=playlists&q=수정한&sort=title')).body.items[0].is_public,1);
 assert.equal((await f.call('/api/playlists/'+publicId+'/save','DELETE')).status,200);
 assert.equal((await f.call('/api/playlists/'+id,'DELETE')).status,200);
 assert.equal((await f.call('/api/me/music-library?section=playlists')).body.total,0);
 assert.equal((await f.call('/api/playlists/'+publicId,'GET',null,'other')).status,200);
});
test('swipes reject vertical/diagonal/slow/edge/multitouch gestures and clamp to three categories',()=>{
 const c=vm.createContext({URLSearchParams});vm.runInContext(source,c);
 const start={x:200,y:200,time:0,width:390};
 const swipe=(end,index=1,patch={})=>c.musicLibrarySwipe({...start,...patch},{time:300,y:205,...end},index);
 assert.equal(swipe({x:100}),2);assert.equal(swipe({x:280}),0);
 assert.equal(swipe({x:150}),1);assert.equal(swipe({x:100,y:300}),1);assert.equal(swipe({x:100,time:800}),1);
 assert.equal(swipe({x:100},1,{x:10}),1);assert.equal(swipe({x:100},1,{x:380}),1);assert.equal(swipe({x:100},1,{cancelled:true}),1);
 assert.equal(swipe({x:100},2),2);assert.equal(swipe({x:280},0),0);
});
test('legacy query state stays bounded and likes is the initial category',()=>{
 const c=vm.createContext({URLSearchParams});vm.runInContext(source,c);
 assert.equal(c.musicLibraryOptions('profile?view=library').section,'likes');assert.equal(c.musicLibraryOptions('profile?view=library&section=uploads').section,'likes');
 assert.equal(c.musicLibraryOptions('profile?view=library&section=playlists&sort=name').sort,'title');
 assert.equal(c.musicLibraryOptions('profile?view=library&q='+'a'.repeat(200)).q.length,100);
});
