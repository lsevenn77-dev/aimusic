import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {diamondPayoutDate,earningsSchedule,settlementPolicyHTML} from '../shared/gifts.js';
import {PLAYER_ITEMS} from '../shared/player.js';
import {fixture} from './fixture.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
function ui({profile={id:'producer',name:'QA'},wallet={balance:1234,diamonds:{available:12.34567}},error,user={id:'owner'}}={}){
 const calls=[],c=vm.createContext({me:user,URLSearchParams,location:{hash:'#profile'},document:{addEventListener(){}},window:{addEventListener(){}},
  esc,number:n=>Number(n).toLocaleString('ko-KR'),icon:()=>'',myPageHeading:()=>'<h1>마이</h1>',personProfileHTML:()=>'<article>PROFILE</article>',musicProfileItems:()=>[],
  playerProgressHTML:()=>'',musicMyShortcuts:()=>'',heading:()=>'',portrait:()=>'',formField:()=>'',gate:()=>'<h1>로그인</h1>',
  api:async path=>{calls.push(path);if(path==='/api/gold'){if(error)throw error;return wallet;}if(path==='/api/me/profile')return {profile};if(path.startsWith('/api/producers/'))return {profile};throw Error('Unexpected '+path);}});
 vm.runInContext(read('dist/diamonds.js'),c);vm.runInContext(read('dist/improvements.js'),c);
 return {c,calls};
}
test('private My wallet shows server balances for profiles with and without public pages',async()=>{
 for(const profile of [{id:'producer',name:'QA'},{name:'New'}]){
  const {c,calls}=ui({profile}),view=await c.improvementsView('profile','','profile');
  assert.match(view.html,/1,234/);assert.match(view.html,/12.34567/);assert.match(view.html,/💎/);
  assert.match(view.html,/href="#gold"/);assert.match(view.html,/href="#payouts"/);
  assert.equal(calls.filter(p=>p==='/api/gold').length,1);
  await c.improvementsView('profile','','profile');assert.equal(calls.filter(p=>p==='/api/gold').length,2,'re-entry refetches');
 }
});
test('zero balances are real zeros; missing/failed balances never masquerade as zero',async()=>{
 const zero=ui({wallet:{balance:0,diamonds:{available:0}}});
 assert.doesNotMatch((await zero.c.improvementsView('profile','','profile')).html,/다시 불러오기|—/);
 for(const options of [{error:Error('offline')},{wallet:{}},{wallet:{balance:'<bad>',diamonds:{available:null}}}]){
  const {c}=ui(options),view=await c.improvementsView('profile','','profile');
  assert.match(view.html,/다시 불러오기/);assert.match(view.html,/—/);assert.doesNotMatch(view.html,/<strong>0|<bad>/);
 }
 const {c}=ui({error:Object.assign(Error('expired'),{status:401})});await assert.rejects(c.improvementsView('profile','','profile'),/expired/);
});
test('guest, profile editor and other public routes never fetch or expose a private wallet',async()=>{
 const guest=ui({user:null});assert.match((await guest.c.improvementsView('profile','','profile')).html,/로그인/);assert.equal(guest.calls.length,0);
 const edit=ui();assert.doesNotMatch((await edit.c.improvementsView('profile','edit','profile/edit')).html,/my-balance/);assert.ok(!edit.calls.includes('/api/gold'));
 const pub=ui();assert.equal(await pub.c.improvementsView('producer','someone','producer/someone'),null);assert.equal(pub.calls.length,0);
});
test('crew media preserves the entire image and frame versions map to unchanged reward keys',()=>{
 const css=read('dist/october-polish.css').match(/\.crew-main-image\{([^}]+)\}/)[1];
 assert.match(css,/height:auto/);assert.match(css,/object-fit:contain/);assert.doesNotMatch(css,/object-fit:cover/);
 for(const level of [3,4,5]){
  const item=PLAYER_ITEMS['crew-level-'+level];assert.equal(item.min_crew_level,level);assert.equal(item.artwork,`/assets/crew-level-${level}-v2.png`);
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
