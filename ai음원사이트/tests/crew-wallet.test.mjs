import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {diamondPayoutDate,earningsSchedule,settlementPolicyHTML} from '../shared/gifts.js';
import * as AifectPlayer from '../shared/player.js';
const {PLAYER_ITEMS}=AifectPlayer;
import {fixture} from './fixture.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
function ui({profile={id:'producer',name:'QA'},wallet={balance:1234,silver_balance:5678,diamonds:{available:12.34567}},error,user={id:'owner'}}={}){
 const calls=[],c=vm.createContext({me:user,URLSearchParams,location:{hash:'#profile'},document:{addEventListener(){}},window:{addEventListener(){}},
  esc,number:n=>Number(n).toLocaleString('ko-KR'),icon:()=>'',myPageHeading:()=>'<h1>마이</h1>',personProfileHTML:(_d,_id,_tab,balances='')=>'<article>PROFILE'+balances+'</article>',musicProfileItems:()=>[],
  playerProgressHTML:()=>'',musicMyShortcuts:()=>'',heading:()=>'',portrait:()=>'',formField:()=>'',gate:()=>'<h1>로그인</h1>',
  api:async path=>{calls.push(path);if(path==='/api/gold/balance'){if(error)throw error;return wallet;}if(path==='/api/me/profile')return {profile};if(path.startsWith('/api/producers/'))return {profile};throw Error('Unexpected '+path);}});
 vm.runInContext(read('dist/diamonds.js'),c);vm.runInContext(read('dist/improvements.js'),c);
 return {c,calls};
}
test('private My shows gold, silver and a toolbox instead of diamonds, with or without a public page',async()=>{
 for(const profile of [{id:'producer',name:'QA'},{name:'New'}]){
  const {c,calls}=ui({profile}),view=await c.improvementsView('profile','','profile');
  assert.match(view.html,/1,234/);assert.doesNotMatch(view.html,/12\.34567|💎|다이아/);
  assert.match(view.html,/5,678/);assert.match(view.html,/보유 실버/);assert.match(view.html,/href="#rewards"/);
  assert.match(view.html,/href="#gold"/);assert.match(view.html,/href="#inventory"/);assert.match(view.html,/내 도구함/);
  assert.equal(calls.filter(p=>p==='/api/gold/balance').length,1);
  await c.improvementsView('profile','','profile');assert.equal(calls.filter(p=>p==='/api/gold/balance').length,2,'re-entry refetches');
 }
});
test('zero balances are real zeros; missing/failed balances never masquerade as zero',async()=>{
 const zero=ui({wallet:{balance:0,silver_balance:0}});
 assert.doesNotMatch((await zero.c.improvementsView('profile','','profile')).html,/다시 불러오기|—/);
 for(const options of [{error:Error('offline')},{wallet:{}},{wallet:{balance:'<bad>',diamonds:{available:null}}}]){
  const {c}=ui(options),view=await c.improvementsView('profile','','profile');
  assert.match(view.html,/다시 불러오기/);assert.match(view.html,/—/);assert.doesNotMatch(view.html,/<strong>0|<bad>/);
  assert.match(view.html,/href="#inventory"/,'toolbox remains accessible even if gold fails to load');
 }
 const {c}=ui({error:Object.assign(Error('expired'),{status:401})});await assert.rejects(c.improvementsView('profile','','profile'),/expired/);
});
test('guest, profile editor and other public routes never fetch or expose a private wallet',async()=>{
 const guest=ui({user:null});assert.match((await guest.c.improvementsView('profile','','profile')).html,/로그인/);assert.equal(guest.calls.length,0);
 const edit=ui();assert.doesNotMatch((await edit.c.improvementsView('profile','edit','profile/edit')).html,/my-balance/);assert.ok(!edit.calls.includes('/api/gold/balance'));
 const pub=ui();assert.equal(await pub.c.improvementsView('producer','someone','producer/someone'),null);assert.equal(pub.calls.length,0);
});

test('gold checkout hides diamond balances while settlement retains the blue diamond wallet',()=>{
 const {c}=ui();Object.assign(c,{inApp:false,AifectGifts:{GIFT_SETTLEMENT_NOTICE:'선물 안내'},section:title=>'<h2>'+title+'</h2>'});
 vm.runInContext(read('dist/gold-checkout.js'),c);
 const diamonds={available:12.34567,balance:12.34567,cash_value_krw:1234,min_payout_diamonds:100,partner:{eligible_krw:0}};
 const gold=c.goldHTML({balance:1234,diamonds,packs:[{gold:100,price:1100}],checkout_available:true});
 assert.doesNotMatch(gold,/diamond-wallet|💎|12\.34567/);
 assert.match(gold,/1,234/);assert.match(gold,/data-buy-gold="100"/);
 const settlement=c.diamondWalletHTML(diamonds);assert.match(settlement,/💎/);assert.match(settlement,/12\.34567/);
});

test('toolbox links to the existing authenticated inventory without creating a purchase flow',async()=>{
 const {c}=ui();Object.assign(c,{AifectPlayer,heading:title=>'<h1>'+title+'</h1>'});
 vm.runInContext(read('dist/player-progress.js'),c);
 const d={inventory:[],rewards:[],player:{xp:0},profile:{},rules:[],recent:[]};
 const rendered=c.playerInventoryHTML(d,{name:'QA'});
 assert.match(rendered,/<h1>내 도구함<\/h1>/);assert.match(rendered,/보유 아이템/);assert.doesNotMatch(rendered,/다이아|data-buy-/);
 const calls=[];c.api=async path=>{calls.push(path);return path==='/api/me/player'?d:{profile:{name:'QA'}};};
 assert.match((await c.playerView('inventory')).html,/내 도구함/);
 assert.deepEqual(calls,['/api/me/player','/api/me/profile']);
 c.me=null;calls.length=0;assert.match((await c.playerView('inventory')).html,/로그인/);assert.equal(calls.length,0);
});
test('crew media preserves the entire image and frame versions map to unchanged reward keys',()=>{
 const css=read('dist/october-polish.css').match(/\.crew-main-image\{([^}]+)\}/)[1];
 assert.match(css,/height:auto/);assert.match(css,/object-fit:contain/);assert.doesNotMatch(css,/object-fit:cover/);
 for(const level of [3,4,5]){
  const item=PLAYER_ITEMS['crew-level-'+level];assert.equal(item.min_crew_level,level);assert.equal(item.artwork,`/assets/crew-level-${level}-v2.webp`);
  assert.ok(existsSync(new URL('../dist'+item.artwork,import.meta.url)));
 }
});
test('Korean payout cutoff stays in the same month through the 25th, rolling at midnight on the 26th',()=>{
 for(const [date,due] of [['2026-10-05T00:00:00+09:00','2026-10-25'],['2026-10-25T23:59:59+09:00','2026-10-25'],['2026-10-26T00:00:00+09:00','2026-11-25'],['2026-12-26T00:00:00+09:00','2027-01-25'],['2028-02-29T23:59:59+09:00','2028-03-25']])assert.equal(diamondPayoutDate(Date.parse(date)/1000),due);
 assert.deepEqual(earningsSchedule('2026-09',Date.parse('2026-10-05T00:00:00+09:00')/1000),{available_on:'2026-10-05',earnings_available:true,payout_on:'2026-10-25'});
 assert.match(settlementPolicyHTML(),/같은 달 25일/);assert.doesNotMatch(settlementPolicyHTML(),/신청 다음 달 25일/);
});
for(const [date,due] of [['2026-10-25T23:59:59+09:00','2026-10-25'],['2026-10-26T00:00:00+09:00','2026-11-25']]){
 test('new cash application is atomic and uses displayed due date at '+date,async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(date)});
  const f=await fixture(t);
  f.sql.exec("INSERT INTO diamond_ledger(id,user_id,kind,source_key,amount_mw,eligible_mw,period,created) VALUES('seed','owner','stream','seed',50000000,50000000,'2020-01',0); INSERT INTO payout_accounts(user_id,holder,bank,account_last4,account_cipher,resident_hint,resident_cipher,consent_at,updated) VALUES('owner','QA','신한','1234','test','test','test',0,0)");
  assert.equal((await f.call('/api/gold')).body.diamonds.next_payout_on,due);
  const body={diamonds:100,request_id:'payout-cutoff-test-001'},r=await f.call('/api/diamonds/payout','POST',body);
  assert.equal(r.status,201,JSON.stringify(r));assert.equal(f.sql.prepare('SELECT due_on FROM payout_statements').get().due_on,due);
  assert.equal((await f.call('/api/diamonds/payout','POST',body)).body.id,r.body.id);
  assert.equal((await f.call('/api/diamonds')).body.balance,400);
  assert.equal((await f.call('/api/diamonds/payout','POST',{...body,request_id:'payout-cutoff-test-002'})).status,409);
  assert.equal((await f.call('/api/gold','GET',undefined,null)).status,401);
  assert.equal((await f.call('/api/gold','GET',undefined,'other')).body.diamonds.available,0);
 });
}
