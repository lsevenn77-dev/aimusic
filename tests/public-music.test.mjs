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
test('public catalog filters, pagination and detail only use public, escaped content',async t=>{
 const f=await fixture(t),env={DB:f.DB},request=p=>publicMusicRoute(new Request('https://aifect.test'+p),env,new URL('https://aifect.test'+p).pathname);
 f.sql.prepare('UPDATE tracks SET title=?,description=?,has_cover=1,genres_json=? WHERE id=?').run('Small 100% song','A real story\nSecond line','["Rock","Jazz"]','one');
 let html=await (await request('/music?q=100%25&genre=Jazz&kind=original')).text();
 assert.match(html,/Small 100% song/);assert.doesNotMatch(html,/\/music\/(two|hidden)/);assert.match(html,/\/media\/one\/cover/);
 html=await (await request('/music?q=%27%20OR%201%3D1--')).text();assert.match(html,/조건에 맞는 공개 음악이 없습니다/);
 html=await (await request('/music/one')).text();assert.match(html,/창작자의 곡 소개/);assert.match(html,/A real story\nSecond line/);assert.match(html,/등록된 제작 도구/);
 for(let i=0;i<23;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published')").run('extra-'+i,'Extra '+i);
 html=await (await request('/music')).text();assert.equal((html.match(/class="music-card"/g)||[]).length,24);assert.match(html,/다음 페이지/);
 html=await (await request('/music?page=2')).text();assert.equal((html.match(/class="music-card"/g)||[]).length,2);assert.doesNotMatch(html,/다음 페이지/);
 assert.match(await (await request('/about')).text(),/AI 아티스트는/);
 const head=await publicMusicRoute(new Request('https://aifect.test/music/one',{method:'HEAD'}),env,'/music/one');assert.equal(head.status,200);assert.equal(await head.text(),'');
});
