import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import * as policy from '../shared/playlist-policy.js';
import {cleanupPlaylistTracks,playlistCleanupStatus} from '../server/playlist-cleanup.js';
import {nicknameContext} from './nickname-context.mjs';

function works(sql) {
 sql.exec("UPDATE tracks SET karaoke_at=1,duration=40 WHERE id='one'");
 for(const [id,kind,mode,parent,open] of [['solo','cover','solo',null,0],['recruiting','cover','duet',null,1],['completed','cover','duet','recruiting',0],['future','future','solo',null,0]])
  sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open,duration) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published',?,'one',?,?,?,40)").run(id,'제작곡 '+id,kind,mode,parent,open);
 sql.exec("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,role_count,duration,write_token,created,updated) VALUES('dub','owner','제작곡','{}','{}','','',1,30,'qa',0,0)");
}
test('shared policy uses actual kind, never titles, source IDs, labels or duration',()=>{
 assert.equal(policy.isPlaylistEligibleTrack({kind:'original',title:'커버곡'}),true);
 for(const kind of ['cover','duet','dubbing','completed','recruiting','future',null,undefined])assert.equal(policy.isPlaylistEligibleTrack({kind,original_id:'one',title:'제작곡'}),false);
 assert.equal(policy.isPlaylistEligibleTrack(null),false);
});
test('single add and atomic create reject every non-original ID including forged type',async t=>{
 const {sql,call}=await fixture(t);works(sql);
 const p=(await call('/api/playlists','POST',{name:'제작곡',track_ids:['one']})).body.id;
 assert.equal((await call(`/api/playlists/${p}/tracks/two`,'PUT')).status,200);
 for(const tid of ['solo','recruiting','completed','future','dub','missing']){
  for(const r of [await call(`/api/playlists/${p}/tracks/${tid}`,'PUT',{kind:'original'}),await call('/api/playlists','POST',{name:'불가',track_ids:['three',tid],kind:'original'})]){
   assert.equal(r.status,400,tid);assert.equal(r.body.error,policy.PLAYLIST_INELIGIBLE_MESSAGE);
  }
 }
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
 assert.deepEqual((await call('/api/playlists/'+p)).body.tracks.map(x=>x.id),['one','two']);
});
test('candidate API filters search, likes and history on the server and keeps ordinary likes intact',async t=>{
 const {sql,call}=await fixture(t);works(sql);
 for(const tid of ['one','solo','recruiting','completed','future']){
  sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,0)").run(tid);
  sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,day) VALUES(?,?,'owner','owner',10,'2026-11-06')").run(tid,tid);
 }
 for(const source of ['search','likes','history']){
  const r=await call('/api/playlists/candidates?source='+source);assert.equal(r.status,200);
  assert.ok(r.body.tracks.length);assert.ok(r.body.tracks.every(policy.isPlaylistEligibleTrack));
  if(source!=='search')assert.deepEqual(r.body.tracks.map(t=>t.id),['one']);
 }
 assert.deepEqual((await call('/api/playlists/candidates?q='+encodeURIComponent('제작곡'))).body.tracks,[]);
 assert.equal((await call('/api/playlists/candidates','GET',null,null)).status,401);
 assert.ok((await call('/api/library')).body.likes.some(t=>t.kind==='cover'));
});
test('legacy mixed playlists filter detail, counts, duration, artwork and ordering before cleanup',async t=>{
 const {sql,call}=await fixture(t);works(sql);
 const p=(await call('/api/playlists','POST',{name:'혼합',is_public:true,track_ids:['one','two']})).body.id;
 sql.prepare('INSERT INTO playlist_tracks VALUES(?,?,?,?)').run(p,'solo',0,2);
 for(const result of [(await call('/api/playlists/'+p)).body.playlist,...(await call('/api/library')).body.playlists,...(await call('/api/playlists')).body.playlists]){
  assert.equal(result.tracks,2);assert.equal(result.duration,40);assert.ok(result.covers.every(policy.isPlaylistEligibleTrack));
 }
 assert.deepEqual((await call('/api/playlists/'+p)).body.tracks.map(t=>t.id),['one','two']);
 assert.equal((await call(`/api/playlists/${p}/order`,'PUT',{track_ids:['two','one']})).status,200);
 assert.equal((await call(`/api/playlists/${p}/order`,'PUT',{track_ids:['two','solo','one']})).status,409);
});
test('cleanup commits report and recoverable backups first; preserves all originals and is idempotent',async t=>{
 const f=await fixture(t);works(f.sql);
 const p=(await f.call('/api/playlists','POST',{name:'정리',track_ids:['one','two']})).body.id;
 for(const [i,tid] of ['hidden','solo','recruiting','completed','future'].entries())f.sql.prepare('INSERT INTO playlist_tracks VALUES(?,?,?,?)').run(p,tid,0,i+2);
 const originals=f.sql.prepare("SELECT pt.* FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE t.kind='original' ORDER BY track_id").all();
 const totalTracks=f.sql.prepare('SELECT count(*) n FROM tracks').get().n;
 const DB={...f.DB,async batch(statements){
  assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='playlist:originals:plan'").get().n,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='playlist:originals:backup'").get().n,4);
  return f.DB.batch(statements);
 }};
 const result=await cleanupPlaylistTracks({DB});assert.equal(result.removed,4);assert.equal(result.remaining,0);
 assert.equal(result.plan.groups.reduce((n,g)=>n+g.count,0),4);
 assert.deepEqual(f.sql.prepare('SELECT * FROM playlist_tracks ORDER BY track_id').all(),originals);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,totalTracks);
 await cleanupPlaylistTracks({DB});assert.equal((await playlistCleanupStatus({DB})).removed,4);
});
test('PC/mobile shared renderers remove cover save actions and preserve playback',()=>{
 const c=nicknameContext({AifectPlaylist:policy,esc:String,icon:()=>'',me:null,liked:()=>false,number:String,giftButton:()=>'',cover:()=>'',musicLayout:()=>'',trackMap:new Map(),dialog(html){c.html=html;},paintInteractions(){}});
 vm.runInContext(readFileSync(new URL('../dist/music-ui.js',import.meta.url),'utf8'),c);
 const explorer=readFileSync(new URL('../dist/explorer.js',import.meta.url),'utf8');
 vm.runInContext(explorer.slice(explorer.indexOf('function trackMenu('),explorer.indexOf('function chartTrackPopover(')),c);
 for(const kind of ['original','cover','duet','dubbing','completed','recruiting',undefined]){
  const track={id:'test',kind,title:'제작곡',status:'published'};c.trackMap.set('test',track);
  assert.equal(c.playlistSaveButton(track).includes('data-add='),kind==='original');
  c.trackMenu('test');assert.equal(c.html.includes('data-add='),kind==='original');assert.ok(c.html.includes('data-play='));
 }
 assert.doesNotMatch(c.coverCollectionItem({id:'solo',title:'제작곡',kind:'cover'}),/data-add=/);
});

test('cleanup rechecks a track corrected to original after backup and rolls back failed deletions',async t=>{
 const f=await fixture(t);works(f.sql);
 const p=(await f.call('/api/playlists','POST',{name:'정리 안전성',track_ids:['one']})).body.id;
 f.sql.prepare('INSERT INTO playlist_tracks VALUES(?,?,0,1)').run(p,'solo');
 const corrected={...f.DB,async batch(statements){f.sql.exec("UPDATE tracks SET kind='original' WHERE id='solo'");return f.DB.batch(statements);}};
 assert.equal((await cleanupPlaylistTracks({DB:corrected})).removed,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,2);
 f.sql.exec("UPDATE tracks SET kind='cover' WHERE id='solo'; CREATE TRIGGER test_audit_failure BEFORE INSERT ON admin_audit WHEN NEW.action='playlist:originals:removed' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(cleanupPlaylistTracks({DB:f.DB}),/test failure/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,2);
 f.sql.exec('DROP TRIGGER test_audit_failure');
 f.sql.prepare('UPDATE playlist_tracks SET position=9 WHERE track_id=?').run('solo');
 const result=await cleanupPlaylistTracks({DB:f.DB});assert.equal(result.removed,1);assert.equal(result.remaining,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM playlist_tracks WHERE track_id='one'").get().n,1);
});

test('cleanup handles more than one batch without losing the initial type counts',async t=>{
 const f=await fixture(t);works(f.sql);
 for(let i=0;i<205;i++){
  const pid='legacy-'+i;
  f.sql.prepare("INSERT INTO playlists(id,user_id,name,created) VALUES(?,'owner','Legacy',0)").run(pid);
  f.sql.prepare('INSERT INTO playlist_tracks VALUES(?,?,0,0)').run(pid,'solo');
 }
 for(const count of [100,200,205]){
  const status=await cleanupPlaylistTracks({DB:f.DB});assert.equal(status.removed,count);assert.equal(status.remaining,205-count);
  assert.equal(status.plan.groups[0].count,205);
 }
 assert.equal(f.sql.prepare("SELECT count(*) n FROM tracks WHERE kind='original'").get().n,4);
});
