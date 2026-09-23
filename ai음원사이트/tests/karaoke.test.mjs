import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {KARAOKE_TERMS_VERSION} from '../shared/site-info.js';
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
