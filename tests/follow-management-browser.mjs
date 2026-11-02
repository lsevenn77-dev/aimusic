// Run against a freshly started tests/preview-mypage.mjs --follow-qa on loopback only.
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.AIFECT_PLAYWRIGHT_MODULE?pathToFileURL(process.env.AIFECT_PLAYWRIGHT_MODULE).href:'playwright-core');
import assert from 'node:assert/strict';import fs from 'node:fs';
const origin='http://127.0.0.1:'+Number(process.env.AIFECT_PREVIEW_PORT||4188),dir=process.env.AIFECT_QA_OUTPUT||'work/follow-browser',log=[],errors=[];
fs.mkdirSync(dir,{recursive:true});
const b=await chromium.launch({executablePath:process.env.AIFECT_CHROME||undefined,args:['--autoplay-policy=no-user-gesture-required']});
const pass=(item)=>{log.push(item);console.log('PASS '+item);};
async function ready(p){await p.waitForFunction(()=>document.documentElement.dataset.renderState==='ready'&&document.querySelector('#main')?.dataset.route===(location.hash.slice(1)||'home')&&!document.querySelector('#main[aria-busy=true]'),{},{timeout:15000});assert.equal(await p.locator('#reload-page').count(),0);}
async function go(p,hash){await p.evaluate(h=>location.hash=h,hash);await ready(p);}
async function loaded(p){await p.waitForFunction(()=>document.querySelector('.fm-count')?.textContent.endsWith('명')&&!document.querySelector('.fm-status')?.textContent.includes('불러오는 중'));};
async function count(p,n){await p.waitForFunction(n=>document.querySelector('.fm-count')?.textContent===n,n,{timeout:7000});}
async function search(p,v){await p.locator('.fm-tools input').fill(v);await loaded(p);}
async function rect(p,s){return p.locator(s).first().boundingBox();}
let step='';try{for(const [device,width,height] of [['pc',1440,900],['mobile',390,844]]){
 step=device+' open';const ctx=await b.newContext({viewport:{width,height},isMobile:width<800,hasTouch:width<800,deviceScaleFactor:1});const p=await ctx.newPage();p.setDefaultTimeout(5500);p.on('pageerror',e=>errors.push(device+' '+p.url()+': '+e.message));
 await p.goto(origin+'/#profile',{waitUntil:'domcontentloaded'});await ready(p);await p.locator('.mp-stats a').first().click();await ready(p);await loaded(p);
 await p.screenshot({path:dir+'/after-'+device+'.png'});
 const total=Number((await p.locator('.fm-count').innerText()).replace(/[^\d]/g,''));assert(total>100);assert.equal(await p.locator('.fm-check').count(),0);assert.equal(await p.locator('.fm-rows li').count(),50);
 const title=await rect(p,'.fm-top h1'),mode=await rect(p,'.fm-mode'),sr=await rect(p,'.fm-tools .brand-search'),so=await rect(p,'.fm-sort');assert(Math.abs(title.y+title.height/2-mode.y-mode.height/2)<2);assert(Math.abs(sr.y+sr.height/2-so.y-so.height/2)<3);assert(sr.x+sr.width<=so.x+1);pass(device+' entry, 3 header rows and first page');
 await p.locator('.fm-more').click();await p.waitForFunction(()=>document.querySelectorAll('.fm-rows li').length===100);
 await search(p,'ECHO');await count(p,'2/'+total+'명');await p.locator('.fm-sort').selectOption('name');await loaded(p);assert.deepEqual(await p.locator('.fm-name strong').allTextContents(),['Echo2','echo10']);
 await search(p,'ㅎㄴ');assert((await p.locator('.fm-name strong').count())===50);const matched=Number((await p.locator('.fm-count').innerText()).split('/')[0]);assert(matched>50);
 await p.locator('[data-fm=select]').click();await p.locator('[data-fm=all]').click();await p.waitForFunction(n=>document.querySelector('.fm-bulk strong')?.textContent===n+'명 선택',matched);
 assert.equal(await p.locator('.fm-actions button').count(),0);await p.locator('.fm-bulk [data-fm=remove]').click();assert((await p.locator('#dialog h2').innerText()).includes(String(matched)));await p.locator('#dialog [data-fm=dismiss]').click();
 if(device==='mobile'){await p.screenshot({path:dir+'/selection-mobile.png'});const bar=await rect(p,'.fm-bulk'),boundary=await p.evaluate(()=>Math.min(innerHeight,...[...document.querySelectorAll('.player:not([hidden]),#player-extension:not([hidden])')].map(el=>el.getBoundingClientRect()).filter(r=>r.height&&r.width).map(r=>r.top)));assert(bar.y+bar.height<=boundary+1);}
 await search(p,'no-such-QA-name');assert.equal(await p.locator('.fm-check').count(),0);assert.equal(await p.locator('.fm-status').innerText(),'검색 결과가 없어요.');await search(p,'');await count(p,total+'명');
 pass(device+' pagination, initial consonants, name sort, cross-page selection, cancel and empty state');
 step=device+' operations';const nick=device==='pc'?'가을':'겨울노래';await search(p,nick);const row=p.locator('.fm-rows li').first();
 await row.locator('[data-fm=follow]').click();await p.waitForSelector('.fm-actions [data-fm=unfollow]:not(:disabled)');await row.locator('[data-fm=unfollow]').click();await p.locator('[data-fm=confirm]').click();await p.waitForSelector('.fm-actions [data-fm=follow]:not(:disabled)');
 for(let i=0;i<2;i++){await row.locator('[data-fm=photo]').click();await p.locator('.profile-preview[open] [data-preview-close]').click();assert.equal(await p.locator('.profile-preview').count(),0);}
 await row.locator('[data-fm=photo]').click();await p.waitForSelector('.profile-preview[open]');await p.locator('.preview-count').first().click();await ready(p);await loaded(p);assert.equal(await p.locator('[data-fm=select]').count(),0);assert.equal(await p.locator('.fm-tabs a').count(),2);await p.goBack();await ready(p);await loaded(p);assert.equal(await p.locator('.fm-tools input').inputValue(),'');pass(device+' follow-back/unfollow, profile popup, public list and back');
 await search(p,nick);await p.locator('.fm-actions [data-fm=block]').click();await p.locator('[data-fm=confirm]').click();await count(p,'0/'+(total-1)+'명');
 await p.locator('.fm-tabs a').filter({hasText:'차단 관리'}).click();await ready(p);await loaded(p);assert((await p.locator('.fm-name').allInnerTexts()).some(n=>n.includes(nick)));await p.locator('.fm-actions [data-fm=unblock]').first().click();await p.locator('[data-fm=confirm]').click();await count(p,'0명');pass(device+' block / unblock without restoring a follow');
 await go(p,'profile');assert.equal(await p.locator('.mp-artists a[href^="#follow"]').count(),0);await p.locator('.mp-artist-card').first().click();await ready(p);await p.locator('.fan-stats a[data-followers]').click();await ready(p);await loaded(p);assert(await p.locator('.fm-artist').inputValue());await p.locator('.fm-artist').selectOption('');await ready(p);await loaded(p);assert.equal(await p.locator('[data-fm=select]').count(),0);
 await p.locator('.fm-artist').selectOption('artist');await ready(p);await loaded(p);assert.equal(await p.locator('[data-fm=select]').count(),1);
 const ar=p.locator('.fm-rows li');await p.locator('[data-fm=select]').click();await ar.nth(1).locator('input').check();await ar.nth(2).locator('input').check();await p.locator('.fm-bulk [data-fm=block]').click();assert.match(await p.locator('#dialog').innerText(),/2명 차단/);await p.locator('[data-fm=confirm]').click();await p.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('완료 2명'));
 await p.locator('.fm-tabs a').filter({hasText:'차단 관리'}).click();await ready(p);await loaded(p);await p.locator('[data-fm=select]').click();await p.locator('[data-fm=all]').click();await p.locator('.fm-bulk [data-fm=unblock]').click();await p.locator('[data-fm=confirm]').click();await count(p,'0명');pass(device+' owned artist picker, no overview management, scoped bulk block / unblock');
 await go(p,'artist/artist');await p.locator('.fan-stats a[data-followers]').click();await ready(p);await loaded(p);assert.equal(await p.locator('.fm-artist').inputValue(),'artist');
 await p.goBack();await ready(p);await p.goForward();await ready(p);assert.equal(await p.locator('.fm-artist').inputValue(),'artist');pass(device+' fan page entry, back/forward');
 for(const sz of (device==='mobile'?[320,768,844,390]:[1440])){await p.setViewportSize({width:sz,height:sz===844?390:height});await p.waitForTimeout(90);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const tools=await p.locator('.fm-tools').boundingBox(),sel=await rect(p,'.fm-sort');assert(sel.x+sel.width<=tools.x+tools.width+1);assert((await rect(p,'.fm-tools input')).width>8);}
 pass(device+' responsive widths and orientation');
 // Put the persistent player into its real playing layout before measuring the fixed action bar.
 if(device==='mobile'){
  await go(p,'song/one');await p.locator('#main [data-play="one"]').first().click();await p.waitForSelector('.player:not([hidden])');
  await go(p,'follow?tab=followers');await loaded(p);await p.locator('[data-fm=select]').click();await p.locator('.fm-check').first().check();
  await p.waitForTimeout(180);const box=await rect(p,'.fm-bulk'),player=await rect(p,'.player:not([hidden])');assert(box.y+box.height<=player.y+1,'fixed controls overlap the playing track');
  await p.screenshot({path:dir+'/player-selection-mobile.png'});pass('mobile real player / bulk controls / bottom navigation');
 }
 step=device+' failure';await go(p,'follow?tab=followers');await loaded(p);await p.route('**/api/follow-management?**',async r=>{if(new URL(r.request().url()).searchParams.get('q')==='OFFLINE')return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA 연결 실패'})});return r.continue()});await p.locator('.fm-tools input').fill('OFFLINE');await p.getByText('QA 연결 실패',{exact:false}).first().waitFor();assert.match(await p.locator('.fm-status').innerText(),/QA 연결 실패/);assert.equal(await p.locator('.fm-rows li').count(),0);await p.unrouteAll({behavior:'wait'});await search(p,'');
 await p.route('**/api/follow-management?**',async r=>{if(new URL(r.request().url()).searchParams.get('q')==='옛검색'){await new Promise(done=>setTimeout(done,320));}try{await r.continue()}catch{}});await p.locator('.fm-tools input').fill('옛검색');await p.waitForTimeout(180);await p.locator('.fm-tools input').fill('ECHO');await loaded(p);await p.waitForTimeout(430);assert.match(await p.locator('.fm-count').innerText(),/^2\//);await p.unrouteAll({behavior:'wait'});pass(device+' failed search retry and stale response isolation');
 await go(p,'profile');await p.evaluate(()=>{dialog('<h2>프로필 작업</h2>');location.hash='profile?view=activity'});await ready(p);assert.equal(await p.locator('#dialog[open]').count(),0);pass(device+' former overlay reproduction now closes');
 // The second displayed page can change after confirmation. Remove one selected edge
 // through the real API, then exercise both successful and rejected keys in the same UI batch.
 await go(p,'follow?tab=followers');await loaded(p);await search(p,'하늘');await p.locator('[data-fm=select]').click();
 const chosen=p.locator('.fm-rows li');await chosen.nth(2).locator('input').check();await chosen.nth(3).locator('input').check();const gone=await chosen.nth(2).getAttribute('data-key');
 await p.evaluate(async key=>{const res=await fetch('/api/follow-management?tab=followers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'remove',keys:[key]})});if(!res.ok)throw Error('fixture edit failed');},gone);
 await p.locator('.fm-bulk [data-fm=remove]').click();await p.locator('[data-fm=confirm]').click();await p.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('완료 1명 · 실패 1명'));assert.equal(await p.locator('.fm-status details').count(),1);pass(device+' bulk delete with identified partial failure');
 await go(p,'library/followers');await loaded(p);assert.match(p.url(),/#follow\?tab=followers$/);
 await go(p,'dm/blocked');await loaded(p);assert.match(p.url(),/#follow\?tab=blocks$/);pass(device+' old library and block deep links');
 await go(p,'follow?tab=followers');await search(p,'Echo');const pair=p.locator('.fm-rows li');
 for(let i=0;i<2;i++){await pair.nth(i).locator('[data-fm=follow]').click();await pair.nth(i).locator('[data-fm=unfollow]:not(:disabled)').waitFor();}
 await go(p,'follow?tab=following');await search(p,'echo');await p.locator('[data-fm=select]').click();await p.locator('[data-fm=all]').click();
 await p.locator('.fm-bulk [data-fm=unfollow]').click();await p.locator('[data-fm=confirm]').click();await p.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('완료 2명'));assert.equal(await p.locator('.fm-rows li').count(),0);pass(device+' bulk unfollow');
 await p.goto(origin+'/__qa/viewer/guest');await ready(p);await go(p,'follow?tab=artists&artist=artist');await loaded(p);assert.equal(await p.locator('.fm-mode button,.fm-actions button,.fm-artist').count(),0);
 await p.goto(origin+'/__qa/viewer/owner');await ready(p);pass(device+' anonymous artist deep link has no editing controls');
 step=device+' route cycle';await p.route('**/media/**',async r=>{await new Promise(done=>setTimeout(done,160));try{await r.continue()}catch{}});const paths=['home','karaoke/browse?tab=recommended&type=all','discover','search/Echo','charts','profile','producer/friend','artist/artist','follow?tab=followers','profile?view=library','community','crew/qa-crew','dm','dm/friend','voice','karaoke','gifts','inventory'];
 for(const hash of [...paths,...paths.slice().reverse()]){step=device+' route '+hash;await go(p,hash);assert.doesNotMatch(await p.locator('#main').innerText(),/페이지를 찾을 수 없어요/);assert.equal(await p.locator('#main').count(),1);assert.equal(await p.locator('dialog[open],.aifect-dropdown-menu:not([hidden])').count(),0,hash);assert.equal(await p.locator('.mobile-navigation').count(),0);if(hash.startsWith('follow?')){await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));}}
 pass(device+' '+(2*paths.length)+' route transitions with delayed media / long list');await ctx.close();
}assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/browser-results.json',JSON.stringify({passed:log,uncaught:errors},null,2));}catch(e){console.error('FAILED',step,'after',log.at(-1),errors);throw e;}finally{await b.close()}
