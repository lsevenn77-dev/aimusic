import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {publicMusicRoute} from '../server/public-music.js';
import {publicPage} from '../server/public-pages.js';

test('delete guide is public, account-bound and never performs deletion on navigation',async t=>{
 const {DB,call}=await fixture(t);
 const visit=cookie=>worker.fetch(new Request('https://aifect.test/account/delete',{headers:cookie?{Cookie:cookie}:{}}),{DB},{});
 const guest=await visit();assert.match(await guest.text(),/href="\/#account\/delete"/);
 const member=await visit('aifect_session=owner');
 assert.match(member.headers.get('cache-control'),/no-store/);
 assert.match(await member.text(),/id="delete-account" data-account="owner"/);
 assert.equal((await call('/api/account/delete','POST',{confirmation:'DELETE',account_id:'other'})).status,409);
 assert.equal((await call('/api/account/delete','POST',{confirmation:'DELETE',account_id:'owner'})).status,200);
 assert.doesNotMatch(await (await visit('aifect_session=owner')).text(),/id="delete-account"/);
});
test('song cards expose safe public metadata, hidden tracks have no metadata',async t=>{
 const {DB,sql}=await fixture(t);
 const title='x</script><img src=x onerror=alert(1)>';sql.prepare('UPDATE tracks SET title=? WHERE id=?').run(title,'one');
 for(const id of ['one','hidden']){
  const path='/music/'+id;const res=await publicMusicRoute(new Request('https://aifect.test'+path),{DB},path);const html=await res.text();
  if(id==='hidden'){assert.equal(res.status,404);assert.doesNotMatch(html,/og:image|MusicRecording/);continue;}
  assert.match(html,/property="og:image" content="https:\/\/aifect.co.kr\//);
  assert.equal(JSON.parse(html.match(/application\/ld\+json">([^<]+)<\/script>/)[1]).name,title);
 }
});
test('www page preserves query and disabled checkout is labelled on pricing',async()=>{
 const res=await worker.fetch(new Request('https://www.aifect.co.kr/music/one?q=1'),{},{});
 assert.equal(res.status,301);assert.equal(res.headers.get('location'),'https://aifect.co.kr/music/one?q=1');
 assert.match(publicPage('/pricing',{checkoutOpen:false,premiumCatalogVisible:true}),/신규 가입 준비 중/);
 assert.doesNotMatch(publicPage('/pricing',{checkoutOpen:true,premiumCatalogVisible:true}),/신규 가입 준비 중/);
});
