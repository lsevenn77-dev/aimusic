import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './fixture.mjs';
import {catalog} from '../server/product-catalog.js';
import {presentationHash,reviewBuilds,reviewPlan,productReviewStatus} from '../server/product-reviews.js';
import {productZip} from '../server/product-zip.js';
import {DECORATIONS,FREE_ROOM_THEMES} from '../shared/decorations.js';
import {GIFT_CATALOG,SILVER_GIFT_CATALOG} from '../shared/gifts.js';

const root='/api/admin/products',uid='owner',key=()=>crypto.randomUUID();
const bodyFor=(more={})=>({action:'create',type:'gift',currency:'G',distribution:'shop',name:'테스트 상품',description:'',
 eventOnly:false,options:{unit:23},grantDeadline:null,request_id:key(),...more});
const scope={ADMIN_USER_IDS:uid,AIFECT_PRODUCT_EDITOR_IDS:uid};
const table=(f,name)=>f.sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all();
const salePath='/api/me/gift-inventory/buy';
const assignFunds=f=>f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('product-funds','owner','web',2000,20000,0,'paid',0,1)");
const mutate=(f,id,body)=>f.call(id?root+'/'+id:root,'POST',{request_id:key(),...body});

test('admin inventory directly projects existing catalog without inserting legacy products or converting free skins',async t=>{
 const f=await fixture(t,scope);
 assert.equal((await f.call(root,'GET',undefined,null)).status,401);
 assert.equal((await f.call(root,'GET',undefined,'other')).status,403);
 assert.equal((await f.call(root+'?type=frame&size=2&page=2')).body.products.length,2);
 const result=(await f.call(root+'?size=30')).body;
 assert.deepEqual(result.products.filter(p=>p.type==='gift').map(p=>p.id),[...GIFT_CATALOG,...SILVER_GIFT_CATALOG].map(p=>p.id));
 assert.deepEqual(result.products.filter(p=>p.type!=='gift').map(p=>p.id),Object.keys(DECORATIONS));
 assert.ok(FREE_ROOM_THEMES.every(theme=>!result.products.some(p=>p.id===theme.sku)));
 assert.equal(table(f,'product_catalog').length,0);
 const store=(await f.call('/api/gifts/catalog')).body;
 assert.deepEqual(store.gifts,GIFT_CATALOG);assert.deepEqual(store.silver_gifts,SILVER_GIFT_CATALOG);
 assert.deepEqual((await f.call('/api/decorations')).body.products,Object.values(DECORATIONS));
});

test('read access is separate from definition writes', async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:uid});
 assert.equal((await f.call(root)).body.can_edit,false);
 assert.equal((await f.call(root,'POST',bodyFor())).status,403);
});

test('sale, gift inventory grant and existing rights are independent; retries retain their recorded price',async t=>{
 const f=await fixture(t,scope);assignFunds(f);
 const purchase={gift_type:'heart',quantity:1,request_id:key()};
 assert.equal((await f.call(salePath,'POST',purchase)).status,201);
 const entitlement=table(f,'gift_inventory')[0],lots=table(f,'gift_inventory_lots');
 const status={action:'status',revision:0,sale:false,grant:true,request_id:key()};
 const first=await mutate(f,'heart',status);assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal((await mutate(f,'heart',status)).body.replayed,true);
 assert.equal((await mutate(f,'heart',{...status,sale:true})).status,409);
 assert.equal((await mutate(f,'heart',{...status,request_id:key()})).status,409);
 assert.equal((await f.call('/api/gifts/catalog')).body.gifts.some(p=>p.id==='heart'),false);
 assert.equal((await f.call(salePath,'POST',{...purchase,request_id:key()})).status,409);
 assert.equal((await f.call(salePath,'POST',purchase)).status,201);
 const grant={gift_type:'heart',user_id:'other',quantity:2,reason:'격리 검증',request_id:key(),origin:'event'};
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',grant)).status,400);
 const deadline={mode:'days',days:7};
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...grant,deadline})).status,200);
 const [reward]=table(f,'gift_inventory').filter(i=>i.user_id==='other');
 assert.equal(reward.expires_at-reward.created,7*86400);
 assert.equal(JSON.parse(reward.grant_terms).settlement,'excluded');assert.equal(reward.value,0);
 const changed=await mutate(f,'heart',{action:'edit',revision:1,type:'gift',name:'하트',currency:'G',distribution:'shop',eventOnly:false,
  options:{unit:55},grantDeadline:{mode:'days',days:30}});
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal((await mutate(f,'heart',{action:'status',revision:2,sale:true,grant:false})).status,200);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...grant,deadline})).status,200,'exact grant replay after stop');
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...grant,request_id:key(),deadline})).status,409);
 const next=await f.call(salePath,'POST',{...purchase,request_id:key()});assert.equal(next.status,201);
 assert.equal(table(f,'gift_inventory').find(i=>i.request_id===purchase.request_id).value,50);
 assert.deepEqual(table(f,'gift_inventory').find(i=>i.id===entitlement.id),entitlement);
 assert.deepEqual(table(f,'gift_inventory_lots').slice(0,1),lots);
 assert.equal(table(f,'gift_inventory').find(i=>i.id===reward.id).expires_at,reward.expires_at);
 assert.equal(table(f,'gold_purchases')[0].used,105);
 assert.equal((await mutate(f,'heart',{action:'archive',revision:3})).status,200);
 assert.equal((await f.call(salePath,'POST',{...purchase,request_id:key()})).status,409);
 assert.equal(table(f,'gift_inventory').length,4);
});

test('old direct receipts replay after a price change and stopped themed offers leave stock intact',async t=>{
 const f=await fixture(t,scope);assignFunds(f);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('other-funds','other','web',100,1000,0,'paid',0,1)");
 const gift={gift_type:'balloon',quantity:1,gold:5,request_id:key()},giftPath='/api/tracks/one/gifts';
 const sent=await f.call(giftPath,'POST',gift,'other');assert.equal(sent.status,201);
 assert.equal((await mutate(f,'balloon',{action:'edit',revision:0,name:'풍선',type:'gift',currency:'G',distribution:'shop',eventOnly:false,
  options:{unit:6},grantDeadline:null})).status,200);
 assert.equal((await mutate(f,'balloon',{action:'status',revision:1,sale:false,grant:true})).status,200);
 const replay=await f.call(giftPath,'POST',gift,'other');
 assert.equal(replay.status,200);assert.deepEqual(replay.body.gift,sent.body.gift);
 assert.equal((await f.call(giftPath,'POST',{...gift,request_id:key(),gold:6},'other')).status,409);
 const order={sku:'theme_christmas',period:'P7D',request_id:key()};
 const first=await f.call('/api/decorations/buy','POST',order);assert.equal(first.status,201);
 const owned=table(f,'player_inventory'),orders=table(f,'decoration_orders');
 const pause=await mutate(f,order.sku,{action:'status',revision:0,sale:false,grant:false});assert.equal(pause.status,200);
 assert.equal((await f.call('/api/decorations/buy','POST',{...order,request_id:key()})).status,409);
 assert.equal((await f.call('/api/decorations/buy','POST',order)).status,201);
 assert.deepEqual(table(f,'player_inventory'),owned);assert.deepEqual(table(f,'decoration_orders'),orders);
 assert.equal((await f.call('/api/decorations')).body.inventory[0].product.sku,order.sku);
});

test('parallel changes respect optimistic revisions and copies remain drafts',async t=>{
 const f=await fixture(t,scope),body=bodyFor();
 const [a,b]=await Promise.all([f.call(root,'POST',body),f.call(root,'POST',body)]);
 assert.ok([200,201].includes(a.status)&&[200,201].includes(b.status));assert.equal(a.body.id,b.body.id);
 assert.equal(table(f,'product_catalog').length,1);
 assert.equal((await mutate(f,a.body.id,{action:'status',revision:1,sale:true,grant:false})).status,409);
 const copy=await mutate(f,a.body.id,{action:'copy',revision:1});assert.equal(copy.status,201);
 const copied=await productBy(f,copy.body.id);assert.equal(copied.sale,false);assert.equal(copied.grant,false);assert.equal(copied.activeVersion,null);
 const edits=await Promise.all([
  mutate(f,'coffee',{action:'status',revision:0,sale:false,grant:true}),
  mutate(f,'coffee',{action:'status',revision:0,sale:true,grant:false})
 ]);
 assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
 assert.equal(table(f,'admin_audit').filter(r=>r.action==='product_status').length,1);
});
async function productBy(f,id){return (await f.call(root+'/'+id)).body.product;}

test('review only counts required surfaces for the specified build and presentation',async t=>{
 const f=await fixture(t,scope),{body:{id}}=await f.call(root,'POST',bodyFor());
 const env={DB:f.DB,AIFECT_PRODUCT_ANDROID_BUILD:'android-qa',AIFECT_PRODUCT_IOS_BUILD:'ios-qa'};
 const p=(await catalog(env,[id])).get(id),v={id:key(),mode:'layered'};
 const records=Object.entries(reviewBuilds(env)).flatMap(([platform,build])=>reviewPlan(p,v.mode).map(({surface})=>({platform,build,surface,passed:1})));
 const presentation=await presentationHash(p);
 for(const record of records)record.report=JSON.stringify({presentation});
 assert.equal((await productReviewStatus(env,p,v,records)).ready,true);
 assert.equal((await productReviewStatus(env,{...p,name:'변경'},v,records)).ready,false);
 assert.equal((await productReviewStatus({...env,AIFECT_PRODUCT_IOS_BUILD:'new-app'},p,v,records)).ready,false);
 assert.equal((await productReviewStatus(env,p,v,records.slice(1))).ready,false);
});

test('migration adds fields without recreating or changing legacy ownership, and fresh catalog connections leave it alone',()=>{
 const dir=new URL('../drizzle/',import.meta.url),sql=new DatabaseSync(':memory:');
 try{
  const migrations=readdirSync(dir).filter(file=>file.endsWith('.sql')).sort();
  for(const migration of migrations.filter(file=>file<'0113_product_management.sql'))sql.exec(readFileSync(new URL(migration,dir),'utf8'));
  sql.exec("INSERT INTO users(id,email,name,created) VALUES('legacy','legacy@example.test','QA',1); INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) VALUES('gift','legacy','heart','하트','reward',0,'reward','old-request',0,1); INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('skin','legacy','theme_christmas','decoration','theme_christmas',7,800)");
  const original=sql.prepare('SELECT * FROM player_inventory').all();
  sql.exec(readFileSync(new URL('0113_product_management.sql',dir),'utf8'));
  assert.deepEqual(sql.prepare('SELECT * FROM player_inventory').all(),original);
  assert.deepEqual({...sql.prepare('SELECT gift_type,created,expires_at,grant_terms FROM gift_inventory WHERE id=?').get('gift')},{gift_type:'heart',created:1,expires_at:null,grant_terms:null});
  assert.equal(sql.prepare('SELECT count(*) AS n FROM product_catalog').get().n,0);
 }finally{sql.close();}
});

test('archive parser rejects invalid containers before passing any file to a decoder',async()=>{
 await assert.rejects(()=>productZip(new Uint8Array(40)),{status:400});
 await assert.rejects(()=>productZip(new TextEncoder().encode('plain reference data')), {status:400});
});

test('candidate file and evidence reads are protected before storage access',async t=>{
 const f=await fixture(t,scope),version=key();
 assert.equal((await f.call('/api/admin/product-files/heart/'+version+'/base.webp','GET',undefined,'other')).status,403);
 assert.equal((await f.call('/api/product-assets/heart/'+version+'/base.webp','GET',undefined,null)).status,404);
 assert.equal((await f.call('/api/admin/product-preview?id=heart&surface=shop','GET',undefined,'other')).status,403);
});
