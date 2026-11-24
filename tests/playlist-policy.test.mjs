import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import * as policy from '../shared/playlist-policy.js';
import {playlistCleanupStatus} from '../server/playlist-cleanup.js';
import {nicknameContext} from './nickname-context.mjs';

function works(sql) {
 sql.exec("UPDATE tracks SET karaoke_at=1,duration=40 WHERE id='one'");
 for(const [id,kind,mode,parent,open] of [['solo','cover','solo',null,0],['recruiting','cover','duet',null,1],['completed','cover','duet','recruiting',0],['future','future','solo',null,0]])
  sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open,duration) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published',?,'one',?,?,?,40)").run(id,'제작곡 '+id,kind,mode,parent,open);
 sql.exec("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,role_count,duration,write_token,created,updated) VALUES('dub','owner','제작곡','{}','{}','','',1,30,'qa',0,0)");
}
test('shared policy uses actual kind, never titles, source IDs, labels or duration',()=>{
 assert.equal(policy.isPlaylistEligibleTrack({kind:'original',title:'커버곡'}),true);
 assert.equal(policy.isPlaylistEligibleTrack({kind:'cover'}),true);
 for(const kind of ['duet','dubbing','completed','recruiting','future',null,undefined])assert.equal(policy.isPlaylistEligibleTrack({kind,original_id:'one',title:'제작곡'}),false);
 assert.equal(policy.isPlaylistEligibleTrack(null),false);
});
test('audio IDs resolve the stored type and typed writes reject a forged discriminator',async t=>{
 const {sql,call}=await fixture(t);works(sql);
 const pid=(await call('/api/playlists','POST',{name:'제작곡',track_ids:['one']})).body.id,path='/api/playlists/'+pid;
 for(const tid of ['two','solo','recruiting','completed'])assert.equal((await call(path+'/tracks/'+tid,'PUT')).status,200);
 for(const tid of ['future','dub','missing'])assert.equal((await call(path+'/tracks/'+tid,'PUT')).status,400);
 assert.equal((await call(path+'/items','PUT',{kind:'original',content_id:'solo'})).status,404);
 assert.equal((await call('/api/playlists','POST',{name:'불가',items:[{kind:'cover',content_id:'one'}]})).status,404);
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
 assert.deepEqual((await call(path)).body.tracks.map(x=>x.id),['one','two','solo','recruiting','completed']);
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
  if(source!=='search')assert.deepEqual(r.body.tracks.map(t=>t.id).sort(),['completed','one','recruiting','solo']);
 }
 const matched=(await call('/api/playlists/candidates?q='+encodeURIComponent('제작곡'))).body.items;
 assert.ok(matched.some(i=>i.kind==='dubbing' && i.content_id==='dub'));assert.ok(matched.some(i=>i.kind==='cover'));
 assert.equal((await call('/api/playlists/candidates','GET',null,null)).status,401);
 assert.ok((await call('/api/library')).body.likes.some(t=>t.kind==='cover'));
});
test('legacy public flags cannot expose a mixed list, including through public discovery or artwork',async t=>{
 const {sql,call}=await fixture(t);works(sql);
 const p=(await call('/api/playlists','POST',{name:'혼합',is_public:true,track_ids:['one','two']})).body.id;
 sql.prepare('INSERT INTO playlist_tracks VALUES(?,?,?,?)').run(p,'solo',0,2);
 const own=(await call('/api/playlists/'+p)).body;assert.equal(own.playlist.tracks,3);assert.equal(own.playlist.is_public,0);
 for(const user of [null,'other']){
  for(const suffix of ['/api/playlists/'+p,'/media/playlist/'+p+'/image'])
   assert.equal((await call(suffix,'GET',null,user)).status,404);
  for(const url of ['/api/search?q='+encodeURIComponent('혼합'),'/api/playlists','/api/playlists?home=1'])
   assert.equal((await call(url,'GET',null,user)).body.playlists.length,0);
 }
 assert.equal((await call('/api/playlists/'+p+'/order','PUT',{track_ids:['two','solo','one']})).status,200);
 assert.deepEqual((await call('/api/playlists/'+p)).body.tracks.map(t=>t.id),['two','solo','one']);
});
test('retired original-only cleanup reports historical records without modifying memberships',async t=>{
 const f=await fixture(t);works(f.sql);
 const pid=(await f.call('/api/playlists','POST',{name:'보관',track_ids:['one','solo']})).body.id;
 f.sql.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?)').run('playlist-originals:20261106:old','admin','playlist:originals:removed','{"removed":7}',0);
 for(let i=0;i<2;i++){const status=await playlistCleanupStatus({DB:f.DB});assert.equal(status.retired,true);assert.equal(status.removed,7);assert.equal(status.remaining,0);}
 assert.deepEqual((await f.call('/api/playlists/'+pid)).body.tracks.map(t=>t.id),['one','solo']);
});
test('shared renderers support saving originals and covers and preserve playback',()=>{
 const c=nicknameContext({AifectUnifiedPlaylists:true,AifectPlaylist:policy,esc:String,icon:()=>'',me:null,liked:()=>false,number:String,giftButton:()=>'',cover:()=>'',musicLayout:()=>'',trackMap:new Map(),dialog(html){c.html=html;},paintInteractions(){}});
 vm.runInContext(readFileSync(new URL('../dist/music-ui.js',import.meta.url),'utf8'),c);
 const explorer=readFileSync(new URL('../dist/explorer.js',import.meta.url),'utf8');
 vm.runInContext(explorer.slice(explorer.indexOf('function trackMenu('),explorer.indexOf('function chartTrackPopover(')),c);
 for(const kind of ['original','cover','duet','dubbing','completed','recruiting',undefined]){
  const track={id:'test',kind,title:'제작곡',status:'published'};c.trackMap.set('test',track);
  assert.equal(c.playlistSaveButton(track).includes('data-add='),['original','cover'].includes(kind));
  c.trackMenu('test');assert.equal(c.html.includes('data-add='),['original','cover'].includes(kind));assert.ok(c.html.includes('data-play='));
 }
 assert.match(c.playlistSaveButton({id:'solo',title:'제작곡',kind:'cover'}),/data-add=/);
});
