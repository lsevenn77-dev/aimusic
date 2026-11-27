import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {KARAOKE_TERMS_VERSION,ORIGINAL_UPLOAD_TERMS_VERSION} from '../shared/site-info.js';
import {publicPage} from '../server/public-pages.js';

const upload={title:'노래방 동의',artist:'AI',producer:'Creator',genre:'Rock',ai_tool:'QA',extension:'wav',bytes:128,rights:true,is_ai:true};

test('upload requires the karaoke MR and cover consent and records its version',async t=>{
 const f=await fixture(t);
 const refused=await f.call('/api/uploads','POST',upload);
 assert.equal(refused.status,400);
 assert.equal((await f.call('/api/uploads','POST',{...upload,karaoke:'true'})).status,400);
 const ok=await f.call('/api/uploads','POST',{...upload,karaoke:true});
 assert.equal(ok.status,201,JSON.stringify(ok.body));
 const row=f.sql.prepare('SELECT karaoke_terms,karaoke_at FROM tracks WHERE id=?').get(ok.body.id);
 assert.equal(row.karaoke_terms,KARAOKE_TERMS_VERSION);
 assert.ok(row.karaoke_at>0);
});

test('new original upload records the combined license only after explicit agreement',async t=>{
 const f=await fixture(t);
 const body={...upload,karaoke:true,upload_consent_version:ORIGINAL_UPLOAD_TERMS_VERSION};
 for(const invalid of [{rights:false},{karaoke:false},{is_ai:false},{upload_consent_version:null},{upload_consent_version:'unknown'}]){
  assert.equal((await f.call('/api/uploads','POST',{...body,...invalid})).status,400);
 }
 const ok=await f.call('/api/uploads','POST',body);
 assert.equal(ok.status,201);
 const track=f.sql.prepare('SELECT karaoke_terms,karaoke_at,rights_accepted FROM tracks WHERE id=?').get(ok.body.id);
 assert.equal(track.karaoke_terms,ORIGINAL_UPLOAD_TERMS_VERSION);
 assert.ok(track.karaoke_at>0 && track.rights_accepted>0);
});

test('Android AI original upload accepts the consent shown by the released app without changing the audit version',async t=>{
 const f=await fixture(t);
 const body={...upload,ai_tool:'Donna',extension:'mp3',genres:[],moods:[],performance_mode:'solo',
  lyrics_mode:'auto',lyrics_source:'테스트 가사',lyrics_language:'ko',karaoke:true,upload_consent_version:'2026-11-02.1'};
 for(const invalid of [
  {rights:false},{karaoke:false},{ai_tool:'AI 사용 안 함',is_ai:false},
  {upload_consent_version:'2026-11-02.0'},{extension:'exe'},{bytes:99}
 ]){
  assert.equal((await f.call('/api/uploads','POST',{...body,...invalid})).status,400);
 }
 const uploaded=await f.call('/api/uploads','POST',body);
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 const profile=await f.call('/api/studio/tracks/'+uploaded.body.id);
 assert.equal(profile.status,200);
 assert.equal(profile.body.profile.status,'uploading');
 const row=f.sql.prepare('SELECT karaoke_terms,karaoke_at,rights_accepted,is_ai,original_ext FROM tracks WHERE id=?').get(uploaded.body.id);
 assert.equal(row.karaoke_terms,body.upload_consent_version);
 assert.ok(row.karaoke_at>0 && row.rights_accepted>0);
 assert.equal(row.is_ai,1);
 assert.equal(row.original_ext,'mp3');
});

test('tracks uploaded before the clause opt in once, only by their owner',async t=>{
 const f=await fixture(t);
 assert.equal(f.sql.prepare("SELECT karaoke_at FROM tracks WHERE id='one'").get().karaoke_at,0);
 assert.equal((await f.call('/api/uploads/one/karaoke','POST',{accept:true},'other')).status,404);
 assert.equal((await f.call('/api/uploads/one/karaoke','POST',{})).status,400);
 assert.equal((await f.call('/api/uploads/one/karaoke','POST',{accept:true})).status,200);
 const first=f.sql.prepare("SELECT karaoke_terms,karaoke_at FROM tracks WHERE id='one'").get();
 assert.equal(first.karaoke_terms,KARAOKE_TERMS_VERSION);
 f.sql.exec("UPDATE tracks SET karaoke_terms='old',karaoke_at=1 WHERE id='one'");
 assert.equal((await f.call('/api/uploads/one/karaoke','POST',{accept:true})).status,200);
 assert.deepEqual({...f.sql.prepare("SELECT karaoke_terms,karaoke_at FROM tracks WHERE id='one'").get()},{karaoke_terms:'old',karaoke_at:1},'An existing consent keeps its original version and time');
});

test('terms page states the karaoke clause',()=>{
 const page=publicPage('/terms');
 assert.match(page,/id="karaoke"/);
 assert.match(page,/노래방 MR 제공과 커버 허락/);
});
