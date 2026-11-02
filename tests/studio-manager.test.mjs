import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fixture} from './fixture.mjs';

const script=readFileSync(new URL('../dist/studio-manager.js',import.meta.url),'utf8');
const media=readFileSync(new URL('../server/media.js',import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function sampleTracks(n=3){
 return Array.from({length:n},(_,i)=>({id:'work-'+i,title:'작품 '+i,kind:i%2?'cover':'original',status:i%3===0?'published':i%3===1?'hidden':'queued'}));
}
function sandbox(tracks){
 const section=s=>`<div class="section-heading">${s}</div>`;
 const ctx={
  studioData:{tracks:[...tracks],track_total:tracks.length,artists:[],producer:null,upload_quota:{used:1,limit:3}},
  studioHTML:()=>`<div class="legacy">legacy</div>${section('내 프로필')}<form id="producer-form">프로필</form>${section('AI 가수 · 아티스트 프로필')}<div class="artist-editors">아티스트</div>`,
  bindStudioForms(){},section,icon:()=>'+',cover:t=>`<span class="mini-cover">${esc(t.title)}</span>`,
  number:n=>String(n),esc,Set,Object,Number,Array,document:{querySelector:()=>null},api:async()=>({tracks:[]}),
 };
 runInNewContext(script,ctx);
 return ctx;
}
test('creator tabs keep profile and artist editors while separating works',()=>{
 const ctx=sandbox(sampleTracks());
 const html=ctx.studioHTML(ctx.studioData);
 assert.match(html,/data-studio-panel="works"/);
 assert.match(html,/data-studio-panel="profile"/);
 assert.match(html,/data-studio-panel="artists"/);
 assert.match(html,/data-studio-type="original"/);
 assert.match(html,/data-studio-type="cover"/);
 assert.match(html,/data-studio-bulk="all-delete"/);
 assert.match(html,/id="producer-form"/);
 assert.match(html,/class="artist-editors"/);
 assert.equal((html.match(/id="producer-form"/g)||[]).length,1);
});
test('kind, status and keyword filters restrict the visible works',()=>{
 const ctx=sandbox(sampleTracks(6));
 const state=runInNewContext('studioManage',ctx);
 state.type='cover';state.status='hidden';state.search='작품 1';
 assert.deepEqual(ctx.studioFiltered().map(t=>t.id),['work-1']);
 state.search='없는 제목';assert.equal(ctx.studioFiltered().length,0);
 state.search='';state.status='processing';state.type='all';
 assert.deepEqual(ctx.studioFiltered().map(t=>t.id),['work-2','work-5']);
});
test('track titles are escaped in work rows',()=>{
 const tracks=[{id:'x',title:'<img src=x onerror=alert(1)>',kind:'original',status:'published'}];
 const ctx=sandbox(tracks),html=ctx.studioHTML(ctx.studioData);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/&lt;img src=x/);
});
test('load-all fetches every page before full deletion is possible',async()=>{
 const all=sampleTracks(205);
 const ctx=sandbox(all.slice(0,100));ctx.studioData.track_total=205;
 const requested=[];
 ctx.api=async url=>{requested.push(url);const offset=Number(new URL(url,'https://unit.local').searchParams.get('offset'));return {tracks:all.slice(offset,offset+100),track_total:205};};
 await runInNewContext('studioLoadComplete()',ctx);
 assert.equal(ctx.studioData.tracks.length,205);
 assert.deepEqual(requested,['/api/studio?offset=100','/api/studio?offset=200']);
});
test('empty pagination aborts rather than silently deleting an incomplete list',async()=>{
 const ctx=sandbox(sampleTracks(2));ctx.studioData.track_total=3;
 await assert.rejects(runInNewContext('studioLoadComplete()',ctx),/전부 불러오지 못했어요/);
});
test('studio API retains owner constraint, excludes deleted rows and pages with bound offset',()=>{
 assert.match(media,/t\.user_id=\? AND t\.status!='deleted'/);
 assert.match(media,/LIMIT 100 OFFSET \?/);
 assert.match(media,/track_total:Number/);
});

test('studio pages span the real uploader’s historical originals and covers, independent of the displayed producer',async t=>{
 const {call,sql}=await fixture(t);
 const insert=sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES(?,?,'artist','producer',?,'Rock','QA',1,'wav',128,1,?,?,?)");
 for(let i=0;i<205;i++)insert.run('legacy-'+i,'other','기존 작품 '+i,i%3?'published':'hidden',i%2?'original':'cover',i%2?null:'one');
 insert.run('deleted-owned','other','삭제한 곡','deleted','original',null);
 const ids=[];
 for(const offset of [0,100,200]){
  const {status,body}=await call('/api/studio?offset='+offset,'GET',undefined,'other');
  assert.equal(status,200);assert.equal(body.track_total,205);ids.push(...body.tracks.map(t=>t.id));
 }
 assert.equal(ids.length,205);assert.equal(new Set(ids).size,205);assert.ok(ids.every(id=>id.startsWith('legacy-')));
 assert.equal((await call('/api/studio?offset=100','GET',undefined,null)).status,401);
 assert.equal((await call('/api/studio?offset=-1')).status,400);
});

test('restore reuses a hidden rendition; failed conversions retry separately and removal cannot be reversed by the uploader',async t=>{
 const {call,sql}=await fixture(t,{BUCKET:{async head(){return {size:128};}}});
 assert.equal((await call('/api/uploads/hidden/retry','POST',undefined,'other')).status,404);
 assert.equal((await call('/api/uploads/hidden/retry','POST')).body.status,'published');
 assert.equal((await call('/api/tracks/hidden')).status,200);
 sql.exec("UPDATE tracks SET status='failed' WHERE id='two'; UPDATE tracks SET status='removed' WHERE id='three'");
 assert.equal((await call('/api/uploads/two/retry','POST')).body.status,'queued');
 assert.equal((await call('/api/uploads/three/retry','POST')).status,409);
 assert.equal(sql.prepare("SELECT status FROM tracks WHERE id='three'").get().status,'removed');
});
