import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {analyzeLyrics,LYRIC_ANALYSIS_VERSION} from '../shared/lyric-semantics.js';
import {analyzeLyricJob,runLyricBatch,lyricAnalysisStatus} from '../server/lyric-analysis.js';
const fill=(sql,id,text)=>sql.prepare('UPDATE tracks SET lyrics=? WHERE id=?').run(text,id);
async function drain(DB){for(let i=0;i<500;i++){if(!await analyzeLyricJob({DB}))return;}throw Error('Queue did not drain');}
const tagIds=(sql,id)=>sql.prepare('SELECT tag_id FROM lyric_search_tags WHERE track_id=?').all(id).map(r=>r.tag_id);
const search=async(call,q,route='/api/search')=>{const r=await call(route+'?'+new URLSearchParams({q}),'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('new songs, changed lyrics, normalized hash deduplication and no lyrics preserve originals',async t=>{
 const {DB,sql}=await fixture(t);fill(sql,'one','[00:01.00] 너를 사랑해\n[00:03.00] 두근두근 행복해');
 await drain(DB);assert.ok(tagIds(sql,'one').includes('love'));assert.deepEqual(tagIds(sql,'two'),[]);
 const before=sql.prepare("SELECT lyrics_hash FROM lyric_analysis_jobs WHERE track_id='one'").get();
 fill(sql,'one','[00:02.00] 너를 사랑해\n[00:05.00] 두근두근 행복해');
 let called=false;const result=await analyzeLyricJob({DB},{analyzer(){called=true;throw Error('must not analyze identical words');}});
 assert.equal(result.cached,true);assert.equal(called,false);assert.equal(sql.prepare("SELECT lyrics_hash FROM lyric_analysis_jobs WHERE track_id='one'").get().lyrics_hash,before.lyrics_hash);
 fill(sql,'one','[00:01.00] 혼자 남아 외로워');await drain(DB);assert.ok(tagIds(sql,'one').includes('lonely'));assert.ok(!tagIds(sql,'one').includes('love'));
 assert.equal(sql.prepare("SELECT lyrics FROM tracks WHERE id='one'").get().lyrics,'[00:01.00] 혼자 남아 외로워');
 assert.equal(sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='two'").get().state,'no_lyrics');
});
test('stale analysis cannot overwrite a concurrent lyric edit; manual include/exclude survives reanalysis',async t=>{
 const {DB,sql,call}=await fixture(t,{ADMIN_USER_IDS:'owner'});await drain(DB);fill(sql,'one','너를 사랑해');
 await analyzeLyricJob({DB},{analyzer(text){fill(sql,'one','혼자 남아 외로워');return analyzeLyrics(text);}});
 assert.equal(sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'queued');assert.deepEqual(tagIds(sql,'one'),[]);
 await drain(DB);assert.ok(tagIds(sql,'one').includes('lonely'));
 assert.equal((await call('/api/admin/lyric-analysis','POST',{action:'pin',track_id:'one',tag_id:'hope',mode:'include'})).status,200);
 assert.equal((await call('/api/admin/lyric-analysis','POST',{action:'pin',track_id:'one',tag_id:'lonely',mode:'exclude'})).status,200);
 fill(sql,'one','혼자 남아 외로워\n오늘도 외로워');await drain(DB);
 assert.ok(tagIds(sql,'one').includes('hope'));assert.ok(!tagIds(sql,'one').includes('lonely'));
 assert.equal(sql.prepare("SELECT source FROM lyric_search_tags WHERE track_id='one' AND tag_id='hope'").get().source,'manual');
 assert.equal((await call('/api/admin/lyric-analysis','GET',undefined,'other')).status,403);
 assert.equal((await call('/api/admin/lyric-analysis','GET',undefined,null)).status,401);
});
test('bounded resumable backfill, lease protection, failures, retry and rebuild',async t=>{
 const {DB,sql,call}=await fixture(t,{ADMIN_USER_IDS:'owner'});sql.exec('DELETE FROM lyric_analysis_jobs');
 const batch=await runLyricBatch({DB},{limit:2});assert.equal(batch.processed,2);assert.equal((await lyricAnalysisStatus({DB})).coverage.missing,0);
 assert.equal((await runLyricBatch({DB})).busy,true);await drain(DB);
 fill(sql,'one','사랑해');for(let i=0;i<3;i++){const r=await analyzeLyricJob({DB},{analyzer(){throw Error('test');}});assert.equal(r.failed,true);sql.exec("UPDATE lyric_analysis_jobs SET lease_until=0 WHERE track_id='one'");}
 assert.equal(sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'failed');
 await call('/api/admin/lyric-analysis','POST',{action:'retry_failed'});await drain(DB);assert.equal(sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'done');
 sql.exec("DELETE FROM lyric_search_tags; DELETE FROM lyric_search_terms");await call('/api/admin/lyric-analysis','POST',{action:'rebuild'});await drain(DB);assert.ok(tagIds(sql,'one').includes('love'));
 sql.exec("UPDATE lyric_analysis_jobs SET state='processing',attempts=3,lease_until=0 WHERE track_id='two'; UPDATE lyric_analysis_control SET lease_until=0");await runLyricBatch({DB});assert.equal(sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='two'").get().state,'failed');
});
test('synonyms and multiple intents rank well while exact title/artist and visibility win on both routes',async t=>{
 const {DB,sql,call}=await fixture(t);
 fill(sql,'one','사랑했지만 헤어졌어\n너를 보고 싶어\n눈물이 나 슬퍼');
 fill(sql,'two','너를 보고 싶어');fill(sql,'three','사랑해 두근두근 행복해');fill(sql,'hidden','헤어졌어 슬퍼\n너를 보고 싶어');
 await drain(DB);
 for(const route of ['/api/search','/api/catalog']){
  assert.equal((await search(call,'슬픈 이별 노래',route)).tracks[0].id,'one');
  const result=await search(call,'헤어진 사람 생각날 때',route);assert.equal(result.tracks[0].id,'one');assert.ok(!result.tracks.some(t=>t.id==='hidden'));
  assert.equal((await search(call,'설레는 사랑 노래',route)).tracks[0].id,'three');
  assert.equal((await search(call,'헤어진사람생각날때',route)).tracks[0].id,'one');
 }
 sql.exec("UPDATE tracks SET title='슬픈 이별 노래' WHERE id='two'");assert.equal((await search(call,'슬픈 이별 노래')).tracks[0].id,'two');
 sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('exact-artist','producer','슬픈 이별 노래',0); UPDATE tracks SET artist_id='exact-artist' WHERE id='three'");
 assert.deepEqual((await search(call,'슬픈 이별 노래')).tracks.map(t=>t.id),['two','three','one']);
 fill(sql,'one','꿈을 향해 다시 시작할 거야');assert.ok(!(await search(call,'헤어진 사람 생각날 때')).tracks.some(t=>t.id==='one'));await drain(DB);assert.ok(tagIds(sql,'one').includes('hope'));
 const current=await lyricAnalysisStatus({DB});assert.equal(current.coverage.current,4);assert.equal(current.version,LYRIC_ANALYSIS_VERSION);
});
test('blocked owners remain excluded; indexed lyric keywords never expose text in the response',async t=>{
 const {DB,sql,call}=await fixture(t,{AIFECT_BLOCKED:['owner']});fill(sql,'one','은하수를 건너 너를 보고 싶어');await drain(DB);
 assert.equal((await search(call,'그리운 사람')).tracks.length,0);assert.equal((await search(call,'은하수')).tracks.length,0);
 const plan=sql.prepare("EXPLAIN QUERY PLAN SELECT track_id FROM lyric_search_terms WHERE term='은하수'").all();assert.ok(plan.some(p=>/lyric_terms_lookup/.test(p.detail)));
});
test('covers use the same original lyrics as playback and requeue when their source changes',async t=>{
 const {DB,sql}=await fixture(t);sql.exec("UPDATE tracks SET kind='cover',original_id='one' WHERE id='two'");fill(sql,'one','너를 사랑해');await drain(DB);assert.ok(tagIds(sql,'two').includes('love'));
 fill(sql,'one','혼자 남아 외로워');await drain(DB);assert.ok(tagIds(sql,'two').includes('lonely'));assert.ok(!tagIds(sql,'two').includes('love'));
 assert.equal(sql.prepare("SELECT lyrics FROM tracks WHERE id='two'").get().lyrics,'');
 sql.exec("UPDATE tracks SET status='deleted' WHERE id='one'");await drain(DB);assert.deepEqual(tagIds(sql,'two'),[]);
});
test('keyword search, duplicate-free paging and bulk counts cover all stored records',async t=>{
 const {DB,sql,call}=await fixture(t);fill(sql,'one','은하수를 건너 너를 보고 싶어');await drain(DB);
 const result=await search(call,'은하수');assert.deepEqual(result.tracks.map(t=>t.id),['one']);assert.equal(result.tracks[0].lyrics,undefined);
 const insert=sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,lyrics) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published','너를 보고 싶어')");
 for(let n=0;n<105;n++)insert.run('lyric-page-'+n,'작품 '+n);await drain(DB);
 const first=await search(call,'그리운 사람');assert.equal(first.counts.tracks,106);assert.equal(first.tracks.length,100);assert.equal(first.has_more,true);
 const last=(await call('/api/search?'+new URLSearchParams({q:'그리운 사람',offset:'100'}),'GET',undefined,null)).body;
 assert.equal(last.tracks.length,6);assert.equal(new Set([...first.tracks,...last.tracks].map(t=>t.id)).size,106);
 const status=await lyricAnalysisStatus({DB});assert.equal(status.coverage.total,109);assert.equal(status.coverage.current,109);assert.equal(status.coverage.missing,0);
});
