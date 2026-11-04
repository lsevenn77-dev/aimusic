// After npm run build, run node tests/preview-mobile-topbar.mjs in another terminal.
// AIFECT_PLAYWRIGHT_MODULE may point to the host's bundled playwright/index.mjs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.AIFECT_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.AIFECT_QA_URL||'http://127.0.0.1:4195';
const out=process.env.AIFECT_QA_OUTPUT||'work/topbar-qa';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.AIFECT_BROWSER_CHANNEL?{channel:process.env.AIFECT_BROWSER_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
await page.context().addCookies([{name:'aifect_session',value:'owner',url:base}]);
const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.renderState==='ready');
const toggle=()=>page.locator('#mobile-topbar-toggle');
const settle=()=>page.waitForTimeout(270);
const goto=async route=>{await page.goto(base+'/#'+route,{waitUntil:'domcontentloaded'});await ready();await page.waitForTimeout(100);};
const measure=()=>page.evaluate(()=>{
 const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};};
 const h=rect('.page-wrap > .topbar'),t=rect('#mobile-topbar-toggle'),main=rect('#main');
 const controls=['#menu-toggle','.mobile-brand','#mobile-topbar-toggle','.header-search','.header-messages','.header-activity','.upload-button'].map(rect);
 const collisions=[...document.querySelectorAll('#main :is(button,a,input,textarea,select)')].filter(e=>{
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&r.height&&s.visibility!=='hidden'&&r.left<t.r&&r.right>t.x&&r.top<t.b&&r.bottom>h.b;
 }).map(e=>e.id||e.className);
 return {h,t,main,controls,collisions,compact:document.querySelector('.topbar').hasAttribute('data-compact-brand'),overflow:document.documentElement.scrollWidth>innerWidth,inert:document.getElementById('common-topbar-content').inert,expanded:document.getElementById('mobile-topbar-toggle').getAttribute('aria-expanded'),sharedHeight:parseFloat(getComputedStyle(document.querySelector('.page-wrap')).getPropertyValue('--topbar-height'))};
});
try {
 await goto('home');
 const routes=['home','community','community/crews','community/rankings','karaoke','karaoke/dubbing','karaoke/browse','profile','profile?view=works','profile?view=library','studio','dm','notifications','search/Rock','song/one','artist/artist','gifts'];
 for(const width of [320,360,390,430,768,800]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(350);
  for(const route of routes){
   await goto(route);
   if(await toggle().getAttribute('aria-expanded')==='false'){await toggle().click();await settle();}
   const expanded=await measure();assert.equal(expanded.h.h,56,`${width} ${route} expanded height`);
   assert.equal(expanded.t.w,44);assert.equal(expanded.t.h,44);
   assert.equal(expanded.overflow,false,`${width} ${route} horizontal overflow`);
   for(let i=1;i<expanded.controls.length;i++)assert.ok(expanded.controls[i].x>=expanded.controls[i-1].r-.5,`${width} ${route} overlapping controls ${i}`);
   const compact=await page.locator('.topbar').evaluate(e=>{const c=getComputedStyle(e);return e.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)<350;});
   assert.equal(expanded.compact,compact,`${width} official brand switch uses available space`);
   if(width===390&&route==='home')await page.screenshot({path:out+'/expanded-390.png'});
   await toggle().click();await settle();
   const collapsed=await measure();assert.equal(collapsed.h.h,18);assert.equal(collapsed.sharedHeight,18);
   assert.equal(collapsed.t.w,72);assert.equal(collapsed.t.h,24);assert.equal(collapsed.inert,true);
   assert.equal(collapsed.t.x+36,expanded.t.x+22,'stable horizontal center');
   assert.ok(Math.abs(expanded.main.y-collapsed.main.y-38)<.5,'real content height gain');
   assert.equal(collapsed.overflow,false);assert.deepEqual(collapsed.collisions,[],`${width} ${route} grip overlaps first controls`);
   results.push({width,route,expanded:expanded.h.h,collapsed:collapsed.h.h,compact:expanded.compact});
   if((width===390||width===320)&&route==='home')await page.screenshot({path:out+`/collapsed-${width}.png`});
  }
  console.log(`Passed 17 routes at ${width}px`);
 }
 // Same DOM/focus through keyboard toggles and rapid repeated clicks.
 await page.setViewportSize({width:390,height:844});await goto('home');
 await toggle().focus();await page.keyboard.press('Enter');await settle();
 assert.equal(await toggle().getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Space');await settle();assert.equal(await toggle().getAttribute('aria-expanded'),'false');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'mobile-topbar-toggle');
 await page.evaluate(()=>{window.__main=document.querySelector('#main').firstElementChild;for(let i=0;i<11;i++)document.querySelector('#mobile-topbar-toggle').click();});await settle();
 assert.equal(await toggle().getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>window.__main===document.querySelector('#main').firstElementChild),true);
 await toggle().click();await settle();
 await page.reload();await ready();assert.equal((await measure()).h.h,18);
 await page.locator('#main a[href="#charts"]').first().click();await ready();await page.goBack();await ready();assert.equal((await measure()).h.h,18);
 for(const width of [801,1440,390,844,320]){
  await page.setViewportSize({width,height:width===1440?900:844});await settle();const m=await measure();
  assert.equal(m.inert,width<=800);assert.equal(m.h.h,width<=800?18:88);assert.equal(m.t.w,width<=800?72:0);
  if(width===1440)await page.screenshot({path:out+'/after-1440.png'});
 }
 // Existing unread painters, not a separate unread counter or read operation.
 await page.setViewportSize({width:390,height:844});await goto('home');
 await page.evaluate(()=>{paintMessageBadge(2);paintActivityBadge(0);});
 assert.equal(await toggle().getAttribute('data-unread'),'');
 await toggle().click();await settle();assert.equal(await toggle().getAttribute('data-unread'),'');
 await page.evaluate(()=>{paintMessageBadge(0);paintActivityBadge(1);});assert.equal(await toggle().getAttribute('data-unread'),'');
 await page.evaluate(()=>paintActivityBadge(0));assert.equal(await toggle().getAttribute('data-unread'),null);
 // Header search input is retained, and the anchored popover follows the row.
 await page.locator('.header-search').click();await page.locator('#global-search input').fill('미완성 검색');
 assert.equal(await page.locator('#global-search').evaluate(e=>e.getBoundingClientRect().top),56);
 await toggle().click();await settle();await toggle().click();await settle();assert.equal(await page.locator('#global-search input').inputValue(),'미완성 검색');
 await page.locator('#menu-toggle').click();await settle();
 assert.equal(await page.locator('#sidebar').evaluate(e=>e.getBoundingClientRect().top),56);
 await toggle().focus();await page.keyboard.press('Space');await settle();assert.equal(await page.locator('#sidebar').getAttribute('class'),'sidebar');
 await toggle().click();await settle();
 // Actual chat history: pin at bottom, preserve older reading position and draft.
 await goto('dm/friend');await page.locator('#chat-log .dm-message').first().waitFor();
 await page.locator('#chat-compose textarea').fill('전송하지 않은 메시지');
 await page.evaluate(()=>{window.__input=document.querySelector('#chat-compose textarea');window.__log=document.querySelector('#chat-log');window.__log.scrollTop=window.__log.scrollHeight;});
 await toggle().click();await settle();
 assert.ok(await page.locator('#chat-log').evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight<3),'chat stays at bottom');
 await page.locator('#chat-log').evaluate(e=>e.scrollTop=150);await page.waitForTimeout(70);
 const old=await page.locator('#chat-log').evaluate(e=>e.scrollTop);
 await toggle().click();await settle();assert.ok(Math.abs(await page.locator('#chat-log').evaluate(e=>e.scrollTop)-old)<3,'reading position');
 assert.equal(await page.locator('#chat-compose textarea').inputValue(),'전송하지 않은 메시지');
 assert.equal(await page.evaluate(()=>window.__input===document.querySelector('#chat-compose textarea')&&window.__log===document.querySelector('#chat-log')),true);
 // Existing fullscreen policy hides the complete shell and restores preference.
 await page.evaluate(()=>setVoiceFocus(true));assert.equal((await measure()).h.h,0);
 await page.evaluate(()=>setVoiceFocus(false));await settle();assert.equal((await measure()).h.h,56);
 await page.emulateMedia({reducedMotion:'reduce'});await toggle().click();
 assert.equal(await page.locator('.topbar').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await settle();
 // Read failure defaults to expanded; write failure doesn't break the UI.
 const denied=await browser.newPage({viewport:{width:390,height:844}});
 await denied.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}}));
 await denied.goto(base+'/#home');await denied.waitForFunction(()=>document.documentElement.dataset.renderState==='ready');
 assert.equal(await denied.locator('.topbar').evaluate(e=>e.getBoundingClientRect().height),56);
 await denied.locator('#mobile-topbar-toggle').click();await denied.waitForTimeout(270);assert.equal(await denied.locator('.topbar').evaluate(e=>e.getBoundingClientRect().height),18);await denied.close();
 // Slow app bundle: saved geometry and hidden controls apply before JS hydration.
 const early=await browser.newPage({viewport:{width:390,height:844}});
 await early.addInitScript(()=>localStorage.setItem('aifect-mobile-topbar-collapsed','1'));
 let releaseBundle;const gate=new Promise(r=>releaseBundle=r);
 await early.route(/\/aifect-app-[a-f0-9]+\.js$/,async route=>{await gate;await route.continue();});
 await early.goto(base+'/#home',{waitUntil:'commit'});
 await early.waitForFunction(()=>document.querySelector('.topbar')?.getBoundingClientRect().height===18);
 assert.equal(await early.locator('#menu-toggle').evaluate(e=>getComputedStyle(e).visibility),'hidden');
 releaseBundle();await early.waitForFunction(()=>document.documentElement.dataset.renderState==='ready');await early.close();
 assert.deepEqual(errors,[]);console.log(`PASS: ${results.length} route/viewport pairs; persistence, desktop, keyboard, focus, unread, search, chat, fullscreen, reduced motion and storage denial.`);
} finally {await writeFile(out+'/report.json',JSON.stringify({results,errors},null,2));await browser.close();}
