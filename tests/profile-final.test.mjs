import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {decorationsFixture} from './decorations-fixture.mjs';
import * as AifectPlayer from '../shared/player.js';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function ui(extra={}){
 const c=nicknameContext({URLSearchParams,AifectPlayer,DEFAULT_AVATAR:'/assets/default-avatar.png',me:{id:'owner'},apiRevision:0,authConfig:{},location:{hash:'#inventory'},document:{addEventListener(){}},window:{addEventListener(){}},esc,number:String,icon:()=>'',portrait:()=>'<img alt="프로필">',heading:t=>'<h1>'+t+'</h1>',gate:()=>'<p>LOGIN</p>',playerProgressHTML:()=>'',...extra});
 for(const name of ['decorations.js','music-library.js','inventory.js','mypage.js','menu-integration.js'])vm.runInContext(source(name),c);
 return c;
}
test('unified inventory preserves every stock ID and expiry, filters real equipment, and reflects equip/unequip on public profile',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','QA',0); INSERT INTO crew_members(crew_id,user_id,joined) VALUES('crew','owner',0); INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('temporary','owner','crew-outline','reward','temporary',100,unixepoch()+86400),('expired','owner','crew-outline','reward','expired',100,10); INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) VALUES('stock1','owner','silver-letter','손편지','reward',0,'reward','grant',0,100),('stock2','owner','silver-letter','손편지','reward',0,'reward','grant',1,100)");
 const calls=[],c=ui({api:async(path,method='GET',body)=>{calls.push({path,method});const r=await f.call(path,method,body);assert.equal(r.status,200,path);return r.body;}});
 let v=await c.unifiedInventoryView('inventory');const before=f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all(),stockBefore=f.sql.prepare('SELECT * FROM gift_inventory ORDER BY id').all();
 assert.match(v.html,/보유 상품/);assert.match(v.html,/사용 중/);assert.match(v.html,/data-inventory-item="temporary"/);assert.match(v.html,/data-inventory-item="expired"/);assert.match(v.html,/만료일/);assert.match(v.html,/사용 기간이 끝났어요/);assert.match(v.html,/× 2/);assert.doesNotMatch(v.html,/내 도구함|토킹룸 테마|다이아/);assert.ok(calls.every(x=>x.method==='GET'));
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:'temporary'})).status,200);
 v=await c.unifiedInventoryView('inventory?section=active');const active=c.inventoryPanel(v.unifiedInventory);assert.match(active,/inventory-frame-original/);assert.doesNotMatch(active,/player-frame-artwork|data-avatar-profile/);
 assert.equal((active.match(/data-inventory-item=/g)||[]).length,1);assert.match(active,/data-inventory-item="temporary"/);assert.match(active,/data-player-equip=""/);assert.match(active,/다른 상품으로 교체/);assert.doesNotMatch(active,/data-inventory-send|data-inventory-item="expired"/);
 const publicProfile=(await f.call('/api/producers/producer')).body;assert.equal(publicProfile.profile.profile_frame,'crew-outline');
 vm.runInContext(source('player-progress.js'),c);c.avatarImage=()=>'<img alt="프로필">';assert.match(c.myProfileHeader(publicProfile),/player-frame-artwork/);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:'temporary'},'other')).status,409);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:'expired'})).status,409);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null})).status,200);
 assert.equal((await f.call('/api/producers/producer')).body.profile.profile_frame,null);
 v=await c.unifiedInventoryView('inventory?section=active');assert.match(c.inventoryPanel(v.unifiedInventory),/사용 중인 상품이 없어요/);
 assert.deepEqual(f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all(),before);assert.deepEqual(f.sql.prepare('SELECT * FROM gift_inventory ORDER BY id').all(),stockBefore);
});
test('inventory groups preserve source, availability and all instance IDs without merging frames',()=>{
 const c=ui(),items=[{id:'a',gift_type:'letter',source:'purchase',currency:'gold',available:true},{id:'b',gift_type:'letter',source:'purchase',currency:'gold',available:true},{id:'c',gift_type:'letter',source:'reward',currency:'reward',available:true},{id:'d',gift_type:'letter',source:'purchase',currency:'gold',available:false}];
 const groups=c.inventoryGiftGroups(items);assert.equal(groups.length,3);assert.equal(groups[0].quantity,2);assert.equal(JSON.stringify(groups.flatMap(x=>x.ids)),JSON.stringify(['a','b','c','d']));assert.equal(items.length,4);
});
test('read errors remain visible, unknown counts are not presented as zero, and guests do not read private stock',async()=>{
 const calls=[],c=ui({api:async path=>{calls.push(path);throw Error('읽기 실패');}});let v=await c.unifiedInventoryView('inventory');assert.match(v.html,/다시 시도/);assert.match(c.inventoryTabs(v.unifiedInventory),/—/);assert.doesNotMatch(v.html,/보유한 상품이 없어요/);
 c.me=null;calls.length=0;v=await c.unifiedInventoryView('inventory');assert.match(v.html,/LOGIN/);assert.equal(calls.length,0);
});
test('activity retains actual gold/silver and restored links while hiding deferred widgets; library has only three categories',async()=>{
 const calls=[],c=ui({crewPicture:()=>'',avatarImage:()=>'',api:async path=>{calls.push(path);return {};}});await c.myActivityData();assert.ok(!calls.some(x=>/diamonds|relations|membership/.test(x)));
 const a={wallet:{balance:123,silver_balance:456},player:{inventory:[],player:{level:1,xp:0,next_xp:100,progress:0}},inventory:{items:[]},activity:{},notifications:{}};
 const html=c.myActivityHTML(a);assert.match(html,/123 G/);assert.match(html,/456 S/);assert.doesNotMatch(html,/다이아|보유 이용권|나의 관계|내 도구함|#relations|받은 선물/);assert.equal(JSON.stringify([...html.matchAll(/<h2>([^<]+)/g)].map(m=>m[1])),JSON.stringify(['보유 자산','내 레벨','인벤토리','내 크루','계정 관리']));assert.match(html,/#membership/);assert.match(html,/#payouts/);assert.match(html,/현재 소속된 크루가 없어요/);
 const aside=c.myActivityAside(a);assert.equal(JSON.stringify([...aside.matchAll(/<h2>([^<]+)/g)].map(m=>m[1])),JSON.stringify(['받은 선물']));assert.doesNotMatch(html+aside,/#gold\/history|보낸 선물|#account|data-mp-recent|알림 기록/);assert.doesNotMatch(aside,/#membership|#payouts|내 크루|계정 관리/);
 const tabs=c.musicLibraryTabs({options:{section:'likes'},data:{counts:{likes:3,history:4,playlists:1}}});assert.equal((tabs.match(/role="tab"/g)||[]).length,3);assert.doesNotMatch(tabs,/보관한 음악/);assert.doesNotMatch(c.musicLibraryAside({tracks:[]}),/다운로드|mp-studio/);
 assert.equal(c.menuAlias('#profile?view=library&section=saved&q=keep'),'#profile?view=library&section=likes&q=keep');assert.equal(c.menuAlias('#gift-inventory'),'#inventory');
});
test('same gesture rules bound two inventory tabs and protect vertical scrolling and native back edges',()=>{
 const c=ui(),s={x:180,y:200,time:0,width:390};assert.equal(c.boundedCategorySwipe(s,{x:80,y:200,time:300},0,2),1);assert.equal(c.boundedCategorySwipe(s,{x:80,y:200,time:300},1,2),1);assert.equal(c.boundedCategorySwipe(s,{x:280,y:200,time:300},1,2),0);
 for(const p of [{x:20},{x:380},{cancelled:true}])assert.equal(c.boundedCategorySwipe({...s,...p},{x:100,y:200,time:300},0,2),0);assert.equal(c.boundedCategorySwipe(s,{x:80,y:320,time:300},0,2),0);
});

test('unified inventory retains deployed decoration stock, active paid frames and theme dates without data writes',async t=>{
 const f=await decorationsFixture(t),stock=await f.buy(),frame=await f.buyUse(),theme=await f.buyUse('theme_starlight_lounge');
 assert.equal(stock.status,201);assert.equal(frame.status,200);assert.equal(theme.status,200);
 const p=(await f.call('/api/me/player')).body,paid=p.inventory.find(i=>i.item_key==='frame_aurora_ring');assert.ok(paid);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:paid.id})).status,200);
 const before=f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all(),calls=[];
 const c=ui({api:async(path,method='GET')=>{calls.push(method);const r=await f.call(path,method);assert.equal(r.status,200);return r.body;}});
 const owned=await c.unifiedInventoryView('inventory');assert.match(owned.html,/data-stored-decoration=/);assert.match(owned.html,/사용 시작/);assert.match(owned.html,/선물하기/);assert.match(owned.html,/data-active-item=/);assert.match(owned.html,/토킹룸에서 사용하기/);
 assert.equal((owned.html.match(new RegExp('data-inventory-item="'+paid.id+'"','g'))||[]).length,1);
 const active=await c.unifiedInventoryView('inventory?section=active'),panel=c.inventoryPanel(active.unifiedInventory);
 assert.match(panel,/data-player-equip=""/);assert.doesNotMatch(panel,/data-stored-decoration=|data-active-item=/);assert.match(panel,/각 방의 설정/);
 assert.ok(calls.every(m=>m==='GET'));assert.deepEqual(f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all(),before);
});
