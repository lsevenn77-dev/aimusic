import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as sitePolicy from '../shared/site-info.js';
import {fixture} from './fixture.mjs';

const script=readFileSync(new URL('../dist/studio-manager.js',import.meta.url),'utf8');
const membership=(plan,used,limit)=>({plan,upload_quota:{used,limit,covers_unlimited:true}});
function harness(){
 const listeners=new Map(),timers=new Map();let sequence=0,html='',disconnected=false;
 const events=()=>({addEventListener(name,fn){listeners.set(this.key+name,fn);},removeEventListener(name,fn){if(listeners.get(this.key+name)===fn)listeners.delete(this.key+name);}});
 const card={set outerHTML(value){html=value;}};
 const root={...events(),key:'root:',isConnected:true,parentNode:{},querySelector:()=>card};
 const ctx={AifectSite:{...sitePolicy,PREMIUM:{...sitePolicy.PREMIUM,catalogVisible:true}},bindStudioForms(){},studioHTML(){},icon:name=>`<svg data-icon="${name}"></svg>`,number:String,
  document:{...events(),key:'document:',hidden:false},window:{...events(),key:'window:'},me:{id:'owner'},location:{hash:'#studio'},
  api:async()=>({user:{id:'owner'},membership:membership('free',0,3)}),AbortController,
  setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
  MutationObserver:class {constructor(fn){this.callback=fn;}observe(){}disconnect(){disconnected=true;}},
 };
 runInNewContext(script,ctx);
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 return {ctx,root,listeners,timers,flush,get html(){return html;},get disconnected(){return disconnected;}};
}

for(const [plan,used,limit,percent] of [['free',0,3,0],['free',1,3,100/3],['free',3,3,100],['premium',0,10,0],['premium',2,10,20],['premium',5,10,50],['premium',10,10,100]]){
 test(`banner ${plan} ${used}/${limit} renders server usage, exact progress and the right action`,()=>{
  const {ctx}=harness(),html=ctx.studioQuotaCard(membership(plan,used,limit),'ready');
  assert.match(html,new RegExp(`>${used} / ${limit}곡</strong>`));
  const progress=Number(html.match(/style="--studio-quota-progress:([\d.]+)%"/)[1]);
  assert.ok(Math.abs(progress-percent)<1e-10);
  assert.match(html,new RegExp(`aria-valuemax="${limit}" aria-valuenow="${used}"`));
  assert.match(html,/완성한 음악을 들려 주세요\./);
  assert.doesNotMatch(html,/이번 달 \d+곡 더 가능/);
  if(used>=limit)assert.match(html,/이번 달 제작곡 한도를 모두 사용했습니다\./);
  assert.doesNotMatch(html,/data-icon="music"|data-icon="diamond"|PREMIUM으로 더 많이/);
  assert.match(html,/<ul class="studio-quota-note"><li>매월 1일 초기화\(한국시간\)<\/li><li>커버곡 무제한<\/li><\/ul>\s*<a [^>]*href="#upload">/);
  assert.equal((html.match(/href="#upload"/g)||[]).length,1);
  assert.match(html,/studio-quota-benefits/);
  assert.equal((html.match(/최대 AAC 256kbps 고음질 감상/g)||[]).length,1);
  assert.match(html,/광고 없는 이용/);
  assert.doesNotMatch(html,/커버 업로드 무제한 · 광고 없음/);
  if(plan==='premium'){
   assert.match(html,/<h2 class="studio-premium-state">/);assert.match(html,/PREMIUM 이용 중/);
   assert.match(html,/제작곡 월 10곡까지 업로드/);
   assert.doesNotMatch(html,/href="#membership"|<button|업그레이드|혜택 보기/);
  }else{
   assert.match(html,/혜택 보기/);assert.match(html,/href="#membership"/);
   assert.match(html,/제작곡 월 10곡까지 업로드/);
   assert.doesNotMatch(html,/studio-premium-state/);
  }
 });
}

test('limits remain dynamic, over-limit expiry usage is preserved and malformed data never looks free',()=>{
 const {ctx}=harness();
 assert.match(ctx.studioQuotaCard(membership('premium',6,12),'ready'),/6 \/ 12/);
 assert.match(ctx.studioQuotaCard(membership('premium',6,12),'ready'),/style="--studio-quota-progress:50%"/);
 assert.match(ctx.studioQuotaCard(membership('premium',6,12),'ready'),/월 12곡/);
 const expired=ctx.studioQuotaCard(membership('free',5,3),'ready');
 assert.match(expired,/5 \/ 3곡/);
 assert.match(expired,/style="--studio-quota-progress:100%"/);
 assert.match(expired,/aria-valuemax="3" aria-valuenow="3"/);
 assert.match(expired,/이번 달 제작곡 한도를 모두 사용했습니다\./);
 assert.doesNotMatch(expired,/-\d+곡 더 가능/);
 for(const value of [null,{plan:'free'},membership('unknown',0,3),membership('free',0,0),membership('free',-1,3),membership('premium','5',10),membership('free',NaN,3),membership('free',1,Infinity),{plan:'free',upload_quota:{used:0,limit:3}}]){
  const html=ctx.studioQuotaCard(value,'ready');
  assert.match(html,/다시 확인/);assert.doesNotMatch(html,/혜택 보기|href="#membership"|이용 중|progressbar|0 \/ 3/);
 }
});

test('fresh entitlement, upload increment, upgrade, cancellation with valid time and expiry update only the banner',async()=>{
 const h=harness(),calls=[];let value=membership('free',0,3);
 h.ctx.api=async(...args)=>{calls.push(args);return {user:{id:'owner'},membership:value};};
 h.ctx.bindStudioQuota(h.root);await h.flush();assert.match(h.html,/0 \/ 3/);
 value=membership('free',1,3);h.listeners.get('window:focus')();await h.flush();assert.match(h.html,/1 \/ 3/);
 value=membership('premium',1,10);h.listeners.get('document:visibilitychange')();await h.flush();assert.match(h.html,/PREMIUM 이용 중/);assert.match(h.html,/1 \/ 10/);
 value={...membership('premium',5,10),premium_until:Date.now()/1000+2};
 h.listeners.get('window:focus')();await h.flush();assert.match(h.html,/5 \/ 10/);
 // Cancelled renewal still has a valid entitlement. Only the server decides when it is free.
 h.listeners.get('window:focus')();await h.flush();assert.match(h.html,/PREMIUM 이용 중/);
 const expiry=[...h.timers.values()].find(t=>t.delay<3000);assert.ok(expiry);
 value=membership('free',5,3);expiry.fn();await h.flush();assert.match(h.html,/5 \/ 3/);assert.match(h.html,/혜택 보기/);
 for(const [path,method,body,options] of calls){assert.equal(path,'/api/me');assert.equal(method,'GET');assert.equal(body,undefined);assert.equal(options.fresh,true);assert.ok(options.signal);}
});

test('failed and unauthenticated refreshes clear premium status; retry recovers',async()=>{
 const h=harness();h.ctx.api=async()=>({user:{id:'owner'},membership:membership('premium',5,10)});
 h.ctx.bindStudioQuota(h.root);await h.flush();assert.match(h.html,/PREMIUM 이용 중/);
 h.ctx.api=async()=>{throw Error('network');};h.listeners.get('window:focus')();await h.flush();
 assert.match(h.html,/확인하지 못했습니다/);assert.doesNotMatch(h.html,/PREMIUM|5 \/ 10/);
 h.ctx.api=async()=>({user:null,membership:membership('free',0,3)});h.listeners.get('window:focus')();await h.flush();assert.doesNotMatch(h.html,/혜택 보기|href="#membership"/);
 h.ctx.api=async()=>({user:{id:'owner'},membership:membership('free',1,3)});
 h.listeners.get('root:click')({target:{closest:()=>true}});await h.flush();assert.match(h.html,/1 \/ 3/);
});

test('pending reads deduplicate, late responses cannot cross accounts and navigation cleans up',async()=>{
 const h=harness();let resolve,count=0;
 h.ctx.api=()=>{count++;return new Promise(r=>resolve=r);};h.ctx.bindStudioQuota(h.root);
 h.listeners.get('window:focus')();assert.equal(count,1);
 h.ctx.me={id:'other'};resolve({user:{id:'owner'},membership:membership('premium',5,10)});await h.flush();assert.equal(h.html,'');
 h.ctx.location.hash='#home';h.listeners.get('window:hashchange')();assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);assert.ok(h.disconnected);
});

test('background polling skips hidden pages, refetches monthly boundary instead of resetting in the client',async()=>{
 const h=harness();let count=0;
 h.ctx.api=async()=>{count++;return {user:{id:'owner'},membership:{...membership('free',3,3),upload_quota:{...membership('free',3,3).upload_quota,resets_at:Date.now()/1000+1}}};};
 h.ctx.bindStudioQuota(h.root);await h.flush();const boundary=[...h.timers.values()].find(t=>t.delay<2000);assert.ok(boundary);
 h.ctx.document.hidden=true;boundary.fn();await h.flush();assert.equal(count,1);assert.match(h.html,/3 \/ 3/);
 h.ctx.document.hidden=false;h.listeners.get('document:visibilitychange')();await h.flush();assert.equal(count,2);assert.match(h.html,/3 \/ 3/);
});

test('actual API entitlement and quota follow original-only usage, Apple grants and expiry on isolated SQLite',async t=>{
 const {sql,call}=await fixture(t);const at=Math.floor(Date.now()/1000);
 sql.prepare("UPDATE tracks SET uploaded_at=?,created=? WHERE id='one'").run(at,at);
 sql.prepare("UPDATE tracks SET uploaded_at=?,created=?,kind='cover',original_id='one' WHERE id='two'").run(at,at);
 let result=await call('/api/me');assert.equal(result.status,200);
 assert.equal(result.body.membership.plan,'free');assert.equal(result.body.membership.upload_quota.used,1);assert.equal(result.body.membership.upload_quota.limit,3);
 sql.prepare("UPDATE users SET apple_premium_until=? WHERE id='owner'").run(at+3600);
 result=await call('/api/me');assert.equal(result.body.membership.plan,'premium');assert.equal(result.body.membership.upload_quota.limit,10);
 sql.prepare("UPDATE users SET apple_premium_until=?,premium_until=? WHERE id='owner'").run(at-1,at-1);
 result=await call('/api/me');assert.equal(result.body.membership.plan,'free');assert.equal(result.body.membership.upload_quota.limit,3);assert.equal(result.body.membership.upload_quota.used,1);
});
