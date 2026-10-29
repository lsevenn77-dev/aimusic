import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,statSync} from 'node:fs';
import {GENRES,MOODS} from '../shared/genres.js';
import {fixture} from './fixture.mjs';
const manifest=JSON.parse(readFileSync('dist/assets/discover/discover-manifest.json','utf8'));
const source=readFileSync('dist/explorer.js','utf8');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function context(){
 const calls=[];
 const c=vm.createContext({$:s=>s==='#dialog'?{addEventListener(){}}:null,document:{addEventListener(){}},AifectGenres:{GENRES,MOODS},genres:['전체',...GENRES],esc,icon:()=>'<svg></svg>',URLSearchParams,console,me:null,
  fetch:async()=>({ok:true,json:async()=>manifest}),api:async path=>{calls.push(path);return path.startsWith('/api/playlists')?{playlists:[]}:{moods:MOODS,tracks:[{id:'one'}]};},
  section:title=>'<h2>'+esc(title)+'</h2>',grid:tracks=>'<div data-existing-grid>'+tracks.map(t=>t.id).join(',')+'</div>',heading:title=>'<h1>'+esc(title)+'</h1>',gate:()=>'<div>login</div>',empty:()=>'',location:{hash:'#discover'}});
 vm.runInContext(source,c);return {c,calls};
}
test('discover manifest exactly covers the runtime taxonomy and 62 real WebP assets',()=>{
 assert.deepEqual(manifest.genres.map(g=>g.name),GENRES);
 assert.deepEqual(manifest.moods.map(m=>m.id),MOODS.map(m=>m.id));
 assert.equal(new Set([...manifest.genres,...manifest.moods].map(a=>a.file)).size,62);
 for(const asset of [...manifest.genres,...manifest.moods]){
  assert.match(asset.file,/^\/assets\/discover\/(genres|moods)\/[a-z-]+\.webp$/);
  const file='dist'+asset.file,bytes=readFileSync(file);
  assert.equal(statSync(file).size,asset.bytes,asset.file);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});
test('discover has one search, four valid shortcuts, 12 moods and 20 + 30 exact genre links',()=>{
 const {c}=context();c.manifest=manifest;const html=vm.runInContext('discoverLayoutHTML(manifest)',c);
 assert.equal((html.match(/id="search-form"/g)||[]).length,1);
 assert.equal((html.match(/class="discover-mood-card"/g)||[]).length,12);
 assert.equal((html.match(/class="discover-genre-card"/g)||[]).length,50);
 assert.equal((html.match(/data-discover-extra hidden/g)||[]).length,30);
 for(const g of GENRES)assert.ok(html.includes('#search?genre='+encodeURIComponent(g)),g);
 for(const m of MOODS)assert.ok(html.includes('#search?mood='+m.id),m.id);
 for(const path of ['#charts','#karaoke/duets','#community/covers','#collections'])assert.ok(html.includes('href="'+path+'"'));
 assert.doesNotMatch(html,/노래방 차트|<h1|explorer-tabs|assets\/genres\//);
 const first=html.match(/placeholder="([^"]+)"/)[1];
 assert.equal(vm.runInContext('discoverLayoutHTML(manifest)',c).match(/placeholder="([^"]+)"/)[1],first);
 assert.equal(vm.runInContext('discoverHints.length',c),8);
});
test('discover landing has no inline results or filter requests',async()=>{
 const {c,calls}=context();const view=await c.explorerView('discover','','discover');
 assert.equal(view.discoverPage,true);assert.equal(calls.length,0);
 assert.doesNotMatch(view.html,/discover-results|data-existing-grid/);
});

test('missing taxonomy mappings fail explicitly and a failed manifest request can retry',async()=>{
 const {c}=context();const errors=[];c.console={error:(...a)=>errors.push(a)};c.fetch=async()=>({ok:true,json:async()=>({...manifest,genres:manifest.genres.slice(1)})});
 await assert.rejects(c.loadDiscoverManifest(),/K-POP/);assert.equal(errors.length,1);
 c.fetch=async()=>({ok:true,json:async()=>manifest});assert.equal((await c.loadDiscoverManifest()).genres.length,50);
});
test('real discovery endpoint preserves public original filtering for all 50 genres and 12 moods',async t=>{
 const {sql,call}=await fixture(t);
 sql.prepare('UPDATE tracks SET moods_json=? WHERE id IN (?,?)').run(JSON.stringify(MOODS.map(m=>m.id)),'one','hidden');
 for(const g of GENRES){sql.prepare('UPDATE tracks SET genre=? WHERE id IN (?,?)').run(g,'one','hidden');const r=await call('/api/discovery?genre='+encodeURIComponent(g),'GET',undefined,null);assert.equal(r.status,200,g);assert.ok(r.body.tracks.some(t=>t.id==='one'),g);assert.ok(r.body.tracks.every(t=>t.id!=='hidden'));}
 for(const m of MOODS){const r=await call('/api/discovery?mood='+m.id,'GET',undefined,null);assert.equal(r.status,200);assert.ok(r.body.tracks.some(t=>t.id==='one'),m.id);assert.ok(r.body.tracks.every(t=>t.id!=='hidden'));}
});
