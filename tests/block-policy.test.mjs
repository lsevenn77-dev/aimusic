import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import {publicDiscoveryRoute} from '../server/public-discovery.js';

const get=async(f,path,user='other')=>{const r=await f.call(path,'GET',null,user);assert.equal(r.status,200,path+': '+JSON.stringify(r.body));return r.body;};
async function setup(t,extra={}){
 const f=await fixture(t,extra),at=Math.floor(Date.now()/1000);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('p2','other','Listener',0); INSERT INTO artists(id,producer_id,name,created) VALUES('sibling','producer','Sibling',0),('listener-artist','p2','ListenerArtist',0); UPDATE tracks SET duration=60,karaoke_at=1; UPDATE tracks SET artist_id='sibling',title='Sibling song' WHERE id='two'; UPDATE tracks SET artist_id='listener-artist',producer_id='p2',user_id='other',title='Listener song' WHERE id='three';");
 f.sql.prepare("UPDATE tracks SET first_published_at=? WHERE status='published'").run(at-60);
 f.sql.exec("INSERT INTO playlists(id,user_id,name,name_key,is_public,created) VALUES('public-list','owner','Public list','public list',1,1); INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('public-list','two',0,0),('public-list','one',1,0),('public-list','three',2,0); INSERT INTO playlist_saves VALUES('other','public-list',0)");
 return f;
}
const artistBlock=f=>f.call('/api/follow-management?tab=following','POST',{action:'block',keys:['a:artist']},'other');
const unblockArtist=f=>f.call('/api/follow-management?tab=blocks','POST',{action:'unblock',keys:['a:artist']},'other');

test('user block removes mutual follows, suppresses recommendation/search/community, and unblock restores exposure only',async t=>{
 const f=await setup(t);
 await f.call('/api/artists/artist/follow','PUT',{},'other');await f.call('/api/artists/sibling/follow','PUT',{},'other');
 await f.call('/api/producers/producer/follow','PUT',{},'other');await f.call('/api/producers/p2/follow','PUT',{},'owner');
 f.sql.exec("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('hidden-comment','three','owner','hidden',1),('visible-comment','three','other','visible',2)");
 assert.equal((await f.call('/api/blocks/owner','PUT',{},'other')).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM follows').get().n,0);
 for(const path of ['/api/discovery','/api/discovery?home=1','/api/catalog?section=tracks','/api/search?q=Sibling','/api/community']){
  const d=await get(f,path);assert.ok(d.tracks.every(t=>t.user_id!=='owner'),path);
 }
 assert.equal((await get(f,'/api/discovery/profiles?kind=artist')).profiles.some(p=>p.id==='artist'||p.id==='sibling'),false);
 assert.deepEqual((await get(f,'/api/tracks/three/comments')).comments.map(c=>c.id),['visible-comment']);
 for(const [actor,target] of [['other','producer'],['owner','p2']]){
  for(const method of ['GET','POST'])assert.equal((await f.call('/api/dm/'+target,method,method==='POST'?{body:'blocked',request_id:crypto.randomUUID()}:null,actor)).status,403);
  assert.equal((await f.call('/api/producers/'+target+'/follow','PUT',{},actor)).status,403);
 }
 assert.equal((await f.call('/api/artists/artist/follow','PUT',{},'other')).status,403);
 const searchPage=await publicDiscoveryRoute(new Request('https://aifect.test/music?q=Sibling',{headers:{Cookie:'aifect_session=other','X-AIFECT-Results':'1'}}),{DB:f.DB},'/music');
 assert.doesNotMatch((await searchPage.json()).html,/href="\/music\/two"/);
 await f.call('/api/blocks/owner','DELETE',{},'other');
 assert.ok((await get(f,'/api/search?q=Sibling')).tracks.some(t=>t.id==='two'));
 assert.equal((await get(f,'/api/discovery?home=1')).tracks.length,3);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM follows').get().n,0);
 assert.equal((await f.call('/api/dm/producer','POST',{body:'restored',request_id:crypto.randomUUID()},'other')).status,201);
});

test('individual artist block preserves creator, sibling artist, their follows and DM; exact search counts and unblock',async t=>{
 const f=await setup(t);
 for(const path of ['/api/artists/artist/follow','/api/artists/sibling/follow','/api/producers/producer/follow'])await f.call(path,'PUT',{},'other');
 assert.deepEqual((await artistBlock(f)).body.ok,['a:artist']);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM user_blocks').get().n,0);
 assert.deepEqual(f.sql.prepare("SELECT target_id FROM follows WHERE user_id='other' ORDER BY target_id").all().map(x=>x.target_id),['producer','sibling']);
 for(const path of ['/api/discovery','/api/discovery?home=1','/api/catalog?section=tracks','/api/search?genre=Rock']){
  const d=await get(f,path);assert.ok(!d.tracks.some(t=>t.id==='one'),path);assert.ok(d.tracks.some(t=>t.id==='two'),path);
  if(d.counts)assert.equal(d.counts.tracks,d.tracks.length);
 }
 for(const path of ['/api/catalog?section=artists&directory=1','/api/catalog?section=artists','/api/discovery/profiles?kind=artist','/api/search?q=QA']){
  const d=await get(f,path),artists=d.artists||d.profiles;assert.ok(!artists.some(a=>a.id==='artist'),path);
  if(d.total!==undefined)assert.equal(d.total,artists.length);
 }
 assert.equal((await f.call('/api/artists/sibling','GET',null,'other')).status,200);
 assert.equal((await f.call('/api/producers/producer','GET',null,'other')).status,200);
 assert.equal((await f.call('/api/dm/producer','POST',{body:'allowed',request_id:crypto.randomUUID()},'other')).status,201);
 assert.equal((await f.call('/api/artists/artist/follow','PUT',{},'other')).status,403);
 f.sql.exec("INSERT INTO artist_follow_blocks VALUES('artist','other','fan',2)");
 await unblockArtist(f);
 assert.ok((await get(f,'/api/search?q=one')).tracks.some(t=>t.id==='one'));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM follows WHERE target_id='artist'").get().n,0);
 assert.deepEqual(f.sql.prepare('SELECT direction FROM artist_follow_blocks').all().map(x=>x.direction),['fan']);
});

test('all public chart families retain complete rows, global ranks and aggregates for blocked and anonymous viewers',async t=>{
 const f=await setup(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()}),at=Math.floor(Date.now()/1000);
 t.mock.method(Date,'now',()=>at*1000);
 f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration) VALUES('cover','owner','artist','producer','cover','Rock','',1,'wav',128,0,'published','cover','one',60)");
 for(const tid of ['one','two','cover']){
  f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,day,qualified,seconds) VALUES(?,?,?,'other',?,'2026-11-18',1,60)").run('listen-'+tid,tid,'listener-'+tid,at);
  f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other',?,?)").run(tid,at);
 }
 const dub=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).body.project;
 assert.ok(dub);
 f.sql.prepare("UPDATE dubbing_projects SET visibility='public',state='complete' WHERE id=?").run(dub.id);
 f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,output_key,manifest_json,created,updated) SELECT 'final',id,script_key,'ready','local-final','{}',?,? FROM dubbing_projects WHERE id=?").run(at,at,dub.id);
 f.sql.prepare("INSERT INTO likes(user_id,dubbing_id,created) VALUES('other',?,?)").run(dub.id,at);
 const paths=[...['top','rising','releases','listens','covers','new'].map(chart=>'/api/catalog?section=tracks&full=1&chart='+chart+'&period=all'),'/api/cover-rankings?kind=tracks&period=all','/api/cover-rankings?kind=singers&period=all',...['aiArtist','cover','dubbing','crew'].map(category=>'/api/community/rankings?category='+category)];
 paths.push('/api/tracks/one/covers?view=all','/api/tracks/one/covers?sort=plays','/api/tracks/one/cover-pick');
 const before=new Map();for(const path of paths)before.set(path,await get(f,path));
 assert.ok(before.get('/api/community/rankings?category=aiArtist').rows.length);
 assert.equal(before.get('/api/community/rankings?category=dubbing').rows.length,1);
 await f.call('/api/blocks/owner','PUT',{},'other');
 for(const path of paths){assert.deepEqual(await get(f,path),before.get(path),path);assert.deepEqual(await get(f,path,null),before.get(path),'anonymous '+path);}
 await f.call('/api/blocks/owner','DELETE',{},'other');
 await f.call('/api/artists/artist/follow','PUT',{},'other');await artistBlock(f);
 for(const path of paths)assert.deepEqual(await get(f,path),before.get(path),'artist '+path);
 assert.equal((await f.call('/api/producers/producer/follow','PUT',{},'other')).status,200);
});

test('public playlist membership, preview, order and playback survive user/artist blocks without database loss',async t=>{
 const bucket=memoryBucket(),f=await setup(t,{BUCKET:bucket});
 await bucket.put('stream/one.m4a',new Uint8Array([1,2,3]));
 const path='/api/playlists/public-list',before=await get(f,path),stored=f.sql.prepare('SELECT * FROM playlist_tracks ORDER BY position').all();
 await f.call('/api/blocks/owner','PUT',{},'other');
 assert.deepEqual(await get(f,path),before);
 assert.equal((await get(f,'/api/library')).playlists[0].tracks,3);
 assert.deepEqual((await get(f,'/api/playlists')).playlists[0].covers.map(t=>t.id),['two','one','three']);
 assert.equal((await f.call('/api/playlists/public-list/save','PUT',{},'other')).status,200);
 const play=await f.call('/api/playback/one','POST',{},'other');assert.equal(play.status,200);assert.equal(play.body.src,'/media/one/stream');
 assert.equal((await f.call('/api/tracks/one/lyrics/text','GET',null,'other')).status,200);
 assert.equal((await f.call('/api/tracks/one/gifts','GET',null,'other')).status,200);
 const media=await worker.fetch(new Request('https://aifect.test/media/one/stream',{headers:{Cookie:'aifect_session=other'}}),{DB:f.DB,BUCKET:bucket},{waitUntil(p){p.catch(()=>{});}});assert.equal(media.status,200);
 assert.equal((await f.call('/api/producers/producer/follow','PUT',{},'other')).status,403);
 await f.call('/api/blocks/owner','DELETE',{},'other');await f.call('/api/artists/artist/follow','PUT',{},'other');await artistBlock(f);
 assert.deepEqual(await get(f,path),before);
 assert.deepEqual(f.sql.prepare('SELECT * FROM playlist_tracks ORDER BY position').all(),stored);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM artist_follow_blocks WHERE direction='artist'").get().n,1);
});

test('web and native shared client invalidates personal caches on block/unblock and retains public chart reads',async()=>{
 const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 for(const native of [false,true]){
  const counts=new Map(),c=vm.createContext({URLSearchParams,structuredClone,console,AifectGenres:{GENRES:[]},window:{Capacitor:{isNativePlatform:()=>native}},Audio:class{},sessionStorage:{getItem:()=>null},document:{addEventListener(){},querySelectorAll:()=>[]},fetch:async path=>{counts.set(path,(counts.get(path)||0)+1);return {ok:true,json:async()=>({tracks:[{id:'one'}]})};}});
  vm.runInContext(source,c);vm.runInContext("me={id:'other'}",c);
  for(const method of ['PUT','DELETE']){
   await vm.runInContext("api('/api/catalog?section=tracks&chart=top')",c);await vm.runInContext("api('/api/discovery')",c);
   const charts=counts.get('/api/catalog?section=tracks&chart=top'),personal=counts.get('/api/discovery');
   await vm.runInContext("api('/api/blocks/owner','"+method+"')",c);
   await vm.runInContext("api('/api/catalog?section=tracks&chart=top')",c);await vm.runInContext("api('/api/discovery')",c);
   assert.equal(counts.get('/api/catalog?section=tracks&chart=top'),charts);assert.equal(counts.get('/api/discovery'),personal+1);
  }
 }
});
