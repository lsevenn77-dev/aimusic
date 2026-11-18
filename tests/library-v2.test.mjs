import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {migrateLibraryBatch,libraryMigrationStatus} from '../server/library-migration.js';
import {normalizePlaylistTitle} from '../shared/playlist-policy.js';
import {playlistsRoute} from '../server/playlists.js';

function content(sql){
 sql.exec("UPDATE tracks SET kind='cover' WHERE id='two'; INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,role_count,duration,write_token,created,updated,visibility) VALUES('one','owner','같은 ID 더빙','{}','{}','','',1,30,'qa',0,0,'public')");
}
const create=async(f,name,extra={},user='owner')=>{const r=await f.call('/api/playlists','POST',{name,...extra},user);assert.equal(r.status,201,JSON.stringify(r));return r.body.id;};

test('playlist playback rechecks source permission, reads current order and ignores a departed page',async()=>{
 const source=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8'),plays=[],messages=[],requests=[];let click;
 const c=vm.createContext({document:{addEventListener(type,fn){click=fn;}},location:{hash:'#playlist/source'},renderId:1,routeTracks:[{id:'old'}],accountReady:Promise.resolve(),me:{id:'other'},remember(){},toast:m=>messages.push(m),play:async(id,tracks)=>plays.push([id,tracks.map(t=>t.id)]),$:()=>({open:false}),api:async()=>{throw Error('플레이리스트를 찾을 수 없습니다.');}});
 vm.runInContext(source.slice(source.indexOf("document.addEventListener('click',async ev=>{"),source.indexOf("audio.addEventListener('playing'")),c);
 const el={dataset:{},hasAttribute:n=>n==='data-play-all',matches:()=>true,setAttribute(){},removeAttribute(){},closest:()=>null},event={target:{closest:()=>el}};
 await click(event);assert.equal(plays.length,0);assert.match(messages[0],/찾을 수 없습니다/);
 c.api=async(path,method)=>{requests.push([path,method]);return {tracks:[{id:'new-first'},{id:'new-last'}]};};
 await click(event);assert.deepEqual(plays,[['new-first',['new-first','new-last']]]);assert.ok(requests.some(([p,m])=>p==='/api/playlists/source/played'&&m==='POST'));
 c.api=async()=>{c.renderId++;return {tracks:[{id:'late'}]};};await click(event);assert.equal(plays.length,1);
});

test('paged lists preserve later order, literal long searches, private bookmark redaction and deletion',async t=>{
 const f=await fixture(t),title='한글로 길게 쓴 검색 제목 '.repeat(3).trim();
 for(let i=0;i<24;i++)await create(f,i===0?title:'공개 '+i,{is_public:true,track_ids:['one']});
 const page=(await f.call('/api/playlists')).body;assert.equal(page.playlists.length,20);assert.equal(page.nextOffset,20);
 assert.equal((await f.call('/api/playlists?offset=20')).body.playlists.length,4);
 assert.equal((await f.call('/api/playlists?q='+encodeURIComponent(title))).body.playlists.length,1);
 const first=(await f.call('/api/library')).body.collections.map(p=>p.id),ids=[...first].reverse();
 assert.equal((await f.call('/api/library/playlists/order','PUT',{playlist_ids:ids})).status,200);
 const sorted=(await f.call('/api/me/music-library?section=playlists&sort=custom&limit=50')).body.items;
 assert.deepEqual(sorted.slice(0,20).map(p=>p.id),ids);assert.equal(new Set(sorted.map(p=>p.id)).size,24);
 const pid=page.playlists[0].id;await f.call('/api/playlists/'+pid+'/save','PUT',null,'other');
 assert.equal((await f.call('/api/playlists/'+pid+'/played','POST',null,'other')).status,200);
 assert.equal((await f.call('/api/me/music-library?section=playlists&sort=played','GET',null,'other')).body.items[0].id,pid);
 await f.call('/api/playlists/'+pid,'PATCH',{is_public:false});
 assert.equal((await f.call('/api/playlists/'+pid+'/played','POST',null,'other')).status,404);
 const unavailable=(await f.call('/api/me/music-library?section=playlists','GET',null,'other')).body.items[0];
 assert.equal(unavailable.unavailable,true);assert.equal(unavailable.image_version,undefined);assert.equal(unavailable.owner_name,undefined);assert.equal(unavailable.revision,undefined);
 assert.equal((await f.call('/api/playlists/'+pid,'GET',null,'other')).status,404);
 assert.equal((await f.call('/api/playlists/'+pid+'/save','DELETE',null,'other')).status,200);
 const b=(await f.call('/api/my-boxes','POST',{name:title,request_id:'same-box',item:{kind:'original',content_id:'one'}})).body;
 assert.equal((await f.call('/api/my-boxes','POST',{name:title,request_id:'same-box',item:{kind:'original',content_id:'one'}})).body.id,b.id);
 assert.equal((await f.call('/api/my-boxes?q='+encodeURIComponent(title))).body.total,1);
 assert.equal((await f.call('/api/my-boxes/'+b.id+'?q='+encodeURIComponent(title))).status,200);
 assert.equal((await f.call('/api/my-boxes/'+b.id,'DELETE')).status,200);assert.equal((await f.call('/api/my-boxes/'+b.id)).status,404);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM my_box_items WHERE box_id=?').get(b.id).n,0);
});
test('unlimited account storage retains rate protection, privacy defaults and Unicode global title uniqueness',async t=>{
 const f=await fixture(t);for(const user of ['owner','other']){for(let i=0;i<12;i++)await create(f,user+' '+i,{},user);}
 assert.equal((await f.call('/api/membership')).body.membership.playlist_limit,null);
 const pid=await create(f,'  Ｎｉｇｈｔ　 Mix  ');assert.equal(normalizePlaylistTitle(' Ｎｉｇｈｔ　 Mix '),'night mix');
 assert.equal((await f.call('/api/playlists','POST',{name:'NIGHT   mix'},'other')).status,409);
 assert.equal((await f.call('/api/playlists/'+pid,'PATCH',{name:'night mix'})).status,200);
 assert.equal((await f.call('/api/playlists/'+pid,'GET',null,'other')).status,404);
 assert.equal((await f.call('/api/playlists','POST',{name:'empty public',is_public:true})).status,400);
 assert.equal((await f.call('/api/playlists/'+pid,'PATCH',{is_public:true})).status,400);
 const race=await Promise.all([f.call('/api/playlists','POST',{name:'Race'}),f.call('/api/playlists','POST',{name:' race '},'other')]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
 for(let i=0;i<40;i++)await f.call('/api/playlists','POST',{name:'rate '+i});assert.equal((await f.call('/api/playlists','POST',{name:'rate blocked'})).status,429);
});
test('bookmarks reference one source, fork is atomic and replay safe, failure/cancel keeps bookmark',async t=>{
 const f=await fixture(t),pid=await create(f,'원본',{is_public:true,track_ids:['one','three']}),url='/api/playlists/'+pid;
 for(let i=0;i<2;i++)assert.equal((await f.call(url+'/save','PUT',null,'other')).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
 assert.equal((await f.call('/api/me/music-library?section=playlists&filter=saved','GET',null,'other')).body.items[0].name,'원본');
 await f.call(url,'PATCH',{name:'수정한 원본'});await f.call(url+'/order','PUT',{track_ids:['three','one']});
 const read=(await f.call(url,'GET',null,'other')).body;assert.equal(read.playlist.name,'수정한 원본');assert.deepEqual(read.tracks.map(t=>t.id),['three','one']);
 const payload={name:'내 편집본',track_ids:read.tracks.map(t=>t.id),source_revision:read.playlist.revision,request_id:'fork-1'};
 assert.equal((await f.call(url+'/fork','POST',{...payload,name:read.playlist.name},'other')).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
 f.sql.exec("CREATE TRIGGER fail_fork BEFORE DELETE ON playlist_saves BEGIN SELECT RAISE(ABORT,'forced storage failure'); END;");
 assert.equal((await f.call(url+'/fork','POST',payload,'other')).status,500);assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
 f.sql.exec('DROP TRIGGER fail_fork');
 const results=await Promise.all([f.call(url+'/fork','POST',payload,'other'),f.call(url+'/fork','POST',payload,'other')]);assert.ok(results.every(r=>r.status===200||r.status===201),JSON.stringify(results));assert.equal(results[0].body.id,results[1].body.id);
 const copy=results[0].body.id;assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,0);
 assert.equal(f.sql.prepare('SELECT source_id FROM playlists WHERE id=?').get(copy).source_id,pid);assert.equal((await f.call('/api/playlists/'+copy,'GET',null,'owner')).status,404);
 await f.call(url+'/save','PUT',null,'other');await f.call(url,'PATCH',{is_public:false});assert.equal((await f.call(url,'GET',null,'other')).status,404);
 assert.equal((await f.call(url+'/fork','POST',payload,'other')).body.id,copy);
 assert.equal((await f.call(url+'/save','DELETE',null,'other')).status,200);
 assert.deepEqual((await f.call('/api/playlists/'+copy,'GET',null,'other')).body.tracks.map(t=>t.id),['three','one']);
});
test('fork rejects a source modified between preflight and transaction, preserving everything',async t=>{
 const f=await fixture(t),pid=await create(f,'snapshot',{is_public:true,track_ids:['one']}),path='/api/playlists/'+pid;
 await f.call(path+'/save','PUT',null,'other');const p=(await f.call(path)).body.playlist;
 const DB={...f.DB,async batch(statements){f.sql.prepare('UPDATE playlists SET revision=revision+1,is_public=0 WHERE id=?').run(pid);return f.DB.batch(statements);}};
 const req=new Request('https://test'+path+'/fork',{method:'POST',body:JSON.stringify({name:'snapshot copy',track_ids:['one'],source_revision:p.revision,request_id:'concurrent'})});
 await assert.rejects(playlistsRoute(req,{DB},path+'/fork',{id:'other'}),e=>e.status===409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
});
test('My Box is private, mixed kinds use composite identity, pagination/filter/order/copy and revoked content are safe',async t=>{
 const f=await fixture(t);content(f.sql);let boxes=[];for(let i=0;i<12;i++){const r=await f.call('/api/my-boxes','POST',{name:'같은 이름'});assert.equal(r.status,201);boxes.push(r.body.id);}const path='/api/my-boxes/'+boxes[0];
 const items=[{kind:'original',content_id:'one'},{kind:'cover',content_id:'two'},{kind:'dubbing',content_id:'one'}];
 for(const item of items)assert.equal((await f.call(path+'/items','PUT',item)).status,200);
 assert.equal((await f.call(path+'/items','PUT',items[0])).body.already_added,true);
 assert.equal((await f.call(path+'/items','PUT',{kind:'original',content_id:'two'})).status,404);
 const detail=(await f.call(path)).body;assert.equal(detail.items.length,3);assert.equal(detail.box.dubbings,1);
 assert.equal((await f.call(path+'?filter=dubbing')).body.items[0].content.title,'같은 ID 더빙');
 assert.equal((await f.call(path+'?limit=2')).body.nextOffset,2);
 for(const [method,suffix,body] of [['GET',''],['PATCH','',{name:'hacked'}],['DELETE',''],['PUT','/items',items[0]],['PUT','/order',{items:[]}],['POST','/copy',{...items[0],target_id:boxes[1]}]])assert.equal((await f.call(path+suffix,method,body,'other')).status,404);
 assert.equal((await f.call(path,'PATCH',{is_public:true,name:'bad'})).status,400);
 assert.equal((await f.call(path+'/share','POST')).status,404);assert.equal((await f.call(path+'/save','PUT',null,'other')).status,404);
 assert.equal((await f.call('/api/search?q='+encodeURIComponent('같은 이름'),'GET',null,null)).body.playlists.length,0);
 assert.equal((await f.call(path+'/order','PUT',{items:[items[2],items[0],items[1]]})).status,200);
 assert.deepEqual((await f.call(path)).body.items.map(i=>i.kind),['dubbing','original','cover']);
 assert.equal((await f.call(path+'/copy','POST',{...items[0],target_id:boxes[1]})).status,200);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'; UPDATE dubbing_projects SET visibility='private',owner_id='other' WHERE id='one'");
 const revoked=(await f.call(path)).body;assert.equal(revoked.items[0].content,null);assert.equal(revoked.items[1].content,null);
 assert.equal((await f.call(path+'/items','DELETE',items[2])).status,200);
 assert.equal((await f.call(path,'PATCH',{name:'변경',revision:999})).status,409);
});
test('migration snapshots first, preserves duplicate titles and original order, restores old backups once',async t=>{
 const f=await fixture(t);content(f.sql);
 f.sql.exec("INSERT INTO playlists(id,user_id,name,created,is_public) VALUES('legacy-a','owner',' MIX ',1,1),('legacy-b','other','mix',2,0); INSERT INTO playlist_tracks VALUES('legacy-a','one',1,0),('legacy-a','two',2,1); INSERT INTO playlist_saves VALUES('other','legacy-a',1)");
 f.sql.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?)').run('old-backup','admin','playlist:originals:backup',JSON.stringify({playlist_id:'legacy-b',track_id:'two',created:4,position:7}),1);
 assert.equal((await f.call('/api/playlists','POST',{name:'mix'})).status,503);
 const DB={...f.DB,async batch(statements){assert.ok(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='library:v2:backup'").get().n>0);return f.DB.batch(statements);}};
 const first=await migrateLibraryBatch({DB});assert.equal(first.pending,0);assert.equal(first.duplicate_title_groups,1);assert.equal(first.migrated_boxes,2);assert.equal(first.preserved_items,2);
 assert.equal((await f.call('/api/playlists','POST',{name:'ＭＩＸ'})).status,409);
 assert.deepEqual(f.sql.prepare('SELECT name FROM playlists ORDER BY id').all().map(p=>p.name),[' MIX ','mix']);
 assert.equal(f.sql.prepare('SELECT is_public FROM playlists WHERE id=?').get('legacy-a').is_public,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
 assert.deepEqual(f.sql.prepare('SELECT track_id,position FROM playlist_tracks').all().map(x=>[x.track_id,x.position]),[['one',0]]);
 await migrateLibraryBatch({DB:f.DB});assert.equal((await libraryMigrationStatus({DB:f.DB})).preserved_items,2);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,4);
});
