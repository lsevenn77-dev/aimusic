import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {publicMusicRoute} from '../server/public-music.js';
test('public music HTML and sitemap contain real visible tracks, escaped descriptions and no private songs',async t=>{
 const f=await fixture(t),env={DB:f.DB,ASSETS:{fetch:async()=>new Response('<html><main id="main"><noscript>old</noscript></main></html>')}};
 f.sql.prepare('UPDATE tracks SET description=? WHERE id=?').run('<script>alert(1)</script>','one');
 const req=p=>new Request('https://aifect.test'+p);
 const home=await (await publicMusicRoute(req('/'),env,'/')).text();assert.match(home,/\/music\/one/);assert.doesNotMatch(home,/\/music\/hidden/);assert.match(home,/&lt;script&gt;/);assert.doesNotMatch(home,/<script>alert/);
 const detail=await publicMusicRoute(req('/music/one'),env,'/music/one');assert.equal(detail.status,200);assert.match(await detail.text(),/곡 정보/);
 for(const id of ['hidden','absent'])assert.equal((await publicMusicRoute(req('/music/'+id),env,'/music/'+id)).status,404);
 f.sql.prepare("UPDATE tracks SET status='removed' WHERE id='one'").run();assert.equal((await publicMusicRoute(req('/music/one'),env,'/music/one')).status,404);
 const xml=await (await publicMusicRoute(req('/sitemap.xml'),env,'/sitemap.xml')).text();assert.match(xml,/\/guide\/recording/);assert.match(xml,/\/music\/two/);assert.doesNotMatch(xml,/\/music\/(hidden|one)/);
 assert.equal(await publicMusicRoute(req('/api/me'),env,'/api/me'),null);
});
