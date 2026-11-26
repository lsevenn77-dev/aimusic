// Run from the repository root after npm run build. Every mutation uses a fresh local SQLite fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.AIFECT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.AIFECT_PLAYWRIGHT_MODULE).href : 'playwright-core');
const output = process.env.AIFECT_QA_OUTPUT || 'work/profile-menu';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AIFECT_CHROME || undefined });
const menuItems = ['구독·이용권 관리','정산내역','계정설정','차단관리','로그아웃'];
async function verify(device,width,height,port) {
  const origin = 'http://127.0.0.1:'+port;
  const server = spawn(process.execPath,['tests/preview-mypage.mjs','--follow-qa'],{
    env:{...process.env,AIFECT_PREVIEW_PORT:String(port)},stdio:['ignore','pipe','inherit'],windowsHide:true
  });
  const ctx = await browser.newContext({viewport:{width,height},isMobile:width<801,hasTouch:width<801});
  try {
    await new Promise((resolve,reject)=>{
      server.stdout.on('data',chunk=>{if(chunk.toString().includes('Local preview:'))resolve();});
      server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited: '+code)));
    });
    const page=await ctx.newPage(), errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    page.setDefaultTimeout(8000);
    const ready=hash=>page.waitForFunction(hash=>location.hash==='#'+hash&&document.querySelector('#main')?.dataset.route===hash
      &&document.documentElement.dataset.renderState==='ready'&&!document.querySelector('#main[aria-busy=true],#reload-page'),hash);
    await page.goto(origin+'/#profile');await ready('profile');
    const navigation=await page.evaluate(()=>performance.timeOrigin);
    const share=page.getByRole('button',{name:'프로필 공유',exact:true}), panel=page.locator('#mp-profile-share');
    const search=panel.getByRole('textbox',{name:'팔로워 검색'}),send=panel.locator('[data-profile-share-send]');
    const open=async()=>{await share.click();await panel.locator('.profile-share-person').first().waitFor();};
    const shot=name=>page.screenshot({path:join(output,name+'-'+device+'.png')});
    await open();assert.equal(await panel.locator('input[name=q]').count(),1);
    assert.equal(await panel.locator('.brand-search').count(),1);assert.equal(await panel.locator('.brand-search svg').count(),1);
    assert.equal(await panel.locator('button[aria-label*=닫기],.dialog-close').count(),0);
    await share.click();await panel.waitFor({state:'hidden'});
    await open();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
    await open();await page.mouse.click(2,3);await panel.waitFor({state:'hidden'});await open();
    assert.equal(await panel.locator('.profile-share-person').count(),50);
    await panel.getByRole('button',{name:'더보기'}).click();await page.waitForFunction(()=>document.querySelectorAll('.profile-share-person').length===100);
    await search.fill('없는닉네임QQ');await panel.getByText('검색된 팔로워가 없어요.').waitFor();
    await search.fill('ECHO');await panel.getByText('Echo2',{exact:true}).waitFor();
    const following=await (await ctx.request.get(origin+'/api/follow-management?tab=following&q=echo')).json();
    assert.equal(following.items.length,0);
    await panel.locator('[data-profile-share-person="qa-p-11"]').check();
    await search.fill('함께 부르는 친구');await panel.locator('[data-profile-share-person="friend"]').check();
    await panel.getByText('2명 선택',{exact:true}).waitFor();
    const bounds=await panel.boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    if(width<801)assert(Math.abs(bounds.y+bounds.height-height)<2);
    await shot('share');
    await search.press('Enter');await panel.locator('[data-profile-share-person="friend"]').waitFor();
    const calls=[];
    await page.route('**/api/dm/*',async route=>{
      const req=route.request();
      if(req.method()!=='POST')return route.continue();
      calls.push({id:req.postDataJSON().request_id,path:new URL(req.url()).pathname});
      const response=await route.fetch();
      assert.equal(response.status(),201);
      if(calls.length===1)await new Promise(r=>setTimeout(r,160));
      if(calls.length===2)return route.fulfill({status:503,json:{error:'응답을 받지 못했어요.'}});
      return route.fulfill({response});
    });
    await send.click();
    assert(await send.isDisabled());
    await send.dispatchEvent('click');await panel.getByRole('alert').filter({hasText:'다시 전송'}).waitFor();
    assert.equal(calls.length,2);await panel.getByText('1명 선택',{exact:true}).waitFor();
    await send.click();await panel.getByText('2명에게 프로필을 보냈어요.').waitFor();assert(await send.isDisabled());
    assert.equal(calls.length,3);assert.equal(calls[1].id,calls[2].id);assert.equal(calls[1].path,calls[2].path);
    await page.unrouteAll({behavior:'wait'});
    for(const id of ['qa-p-11','friend']){
      const messages=(await (await ctx.request.get(origin+'/api/dm/'+id)).json()).messages;
      assert.equal(messages.filter(m=>m.body.includes('https://aifect.co.kr/#producer/producer')).length,1);
    }
    await share.click();await panel.waitFor({state:'hidden'});
    const recipient=await browser.newContext();
    try {
      const inbox=await recipient.newPage();await inbox.goto(origin+'/__qa/viewer/other');
      await inbox.evaluate(()=>location.hash='dm/producer');
      const link=inbox.locator('.dm-profile-share[href="#producer/producer"]').first();await link.click();
      await inbox.locator('.mp-profile').waitFor();assert.equal(new URL(inbox.url()).hash,'#producer/producer');
    } finally {await recipient.close();}
    // A dismiss/reopen while the first response is pending must not create a second batch.
    await open();await search.fill('겨울노래');
    await panel.locator('[data-profile-share-person="qa-p-1"]').check();
    let releaseRequest;
    const hold=new Promise(resolve=>{releaseRequest=resolve;});
    await page.route('**/api/dm/qa-p-1',async route=>{await hold;await route.continue();});
    await send.click();await share.click();await panel.waitFor({state:'hidden'});
    try{await share.click();assert(!(await panel.isVisible()));}finally{releaseRequest();}
    await page.waitForFunction(()=>!document.querySelector('#mp-profile-share').hasAttribute('aria-busy'));
    await page.unrouteAll({behavior:'wait'});
    const settings=page.getByRole('button',{name:'프로필 설정'}),menu=page.locator('#mp-settings-menu');
    const blocked=await ctx.request.put(origin+'/api/blocks/qa-fan-0',{headers:{Origin:origin},data:{}});
    assert(blocked.ok());
    for(const [index,hash] of ['membership','studio/payouts','account','follow?tab=blocks'].entries()){
      await settings.click();assert.deepEqual(await menu.locator('a,button').allTextContents(),menuItems);
      if(!index)await shot('settings');
      await menu.getByRole('link',{name:menuItems[index]}).click();await ready(hash);
      await page.locator(['.membership-subscription','.payout-overview','.ac-dashboard','.fm-page'][index]).waitFor();
      if(index===3){
        await page.locator('.fm-rows li').filter({hasText:'가을'}).getByRole('button',{name:'차단 해제'}).click();
        await page.locator('[data-fm=confirm]').click();await page.locator('.fm-count').getByText('0명',{exact:true}).waitFor();
        assert.equal((await (await ctx.request.get(origin+'/api/follow-management?tab=blocks')).json()).items.length,0);
      }
      await page.goBack();await ready('profile');
    }
    if(width<801){
      for(const size of [320,768]){
        await page.setViewportSize({width:size,height});await open();const box=await panel.boundingBox();
        assert(box.width<=size+1&&Math.abs(box.y+box.height-height)<2);
        assert(await send.isVisible());assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({width,height});
    }
    await settings.click();await menu.getByRole('button',{name:'로그아웃'}).click();
    await page.locator('#dialog [data-close-dialog]').click();await settings.click();
    await menu.getByRole('button',{name:'로그아웃'}).click();
    const logout=page.waitForResponse(r=>r.url().endsWith('/api/auth/logout')&&r.request().method()==='POST');
    await page.locator('#confirm-logout').click();assert((await logout).ok());await ready('account');
    assert.equal((await (await ctx.request.get(origin+'/api/me')).json()).user,null);
    assert.equal(await page.evaluate(()=>performance.timeOrigin),navigation);assert.deepEqual(errors,[]);
    console.log('PASS',device,'share, dismissal, follower search, pagination, selection, DM retry and receipt, four SPA routes, unblock and logout');
  }finally{await ctx.close();server.kill();}
}
try{
  const port=Number(process.env.AIFECT_PREVIEW_PORT||4190);
  await verify('pc',1440,900,port);
  await verify('mobile',390,844,port+1);
}finally{await browser.close();}
