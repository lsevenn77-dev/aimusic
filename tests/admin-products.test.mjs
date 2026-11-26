import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
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

const operate=(f,body,user='owner')=>f.call(root+'/operations','POST',body,user);
const target=(id,revision=0)=>({id,revision});
const apply=(f,action,items,confirmed_ids=items.map(item=>item.id))=>operate(f,{action,items,confirmed_ids,request_id:key()});

test('selling and dispatch stay independent and archive restores the original flags',async t=>{
 const f=await fixture(t,{...scope,AIFECT_GIFT_DISPATCH_OPERATOR_IDS:uid});
 assignFunds(f);
 const purchase={gift_type:'heart',quantity:1,request_id:key()};
 assert.equal((await f.call(salePath,'POST',purchase)).status,201);
 const rights=table(f,'gift_inventory'),lots=table(f,'gift_inventory_lots');
 const changed=await apply(f,'sale_stop',[target('heart')]);
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal(changed.body.items[0].status,'success');
 const dispatch='/api/admin/gift-dispatch',compose={
  audience:{type:'specific',ids:['other']},origin:'admin',reason:'격리 테스트용',
  products:[{product_id:'heart',option:'unit',quantity:2,revision:1}]
 };
 const prepared=await f.call(dispatch+'/preview','POST',compose);
 assert.equal(prepared.status,201,JSON.stringify(prepared.body));
 assert.equal((await f.call(salePath,'POST',{...purchase,request_id:key()})).status,409);
 assert.equal((await apply(f,'archive',[target('heart',1)])).body.items[0].status,'success');
 assert.equal((await f.call(dispatch+'/'+prepared.body.id+'/confirm','POST',{})).status,409);
 assert.equal((await f.call(dispatch+'/preview','POST',compose)).status,409);
 assert.equal((await f.call(salePath,'POST',{...purchase,request_id:key()})).status,409);
 assert.equal((await f.call(root+'?q=heart')).body.total,0);
 const archived=(await f.call(root+'?q=heart&archived=1')).body.products[0];
 assert.equal(archived.dispatch_available,false);
 assert.equal(archived.holders,1);
 assert.deepEqual(table(f,'gift_inventory'),rights);
 assert.deepEqual(table(f,'gift_inventory_lots'),lots);
 assert.equal((await apply(f,'unarchive',[target('heart',2)])).body.items[0].status,'success');
 const reopened=await productBy(f,'heart');
 assert.equal(reopened.dispatch_available,true);
 assert.equal(reopened.sale,false);
 assert.equal((await apply(f,'sale_resume',[target('heart',3)])).body.items[0].status,'success');
 assert.equal((await productBy(f,'heart')).sale,true);
 assert.equal((await mutate(f,'coffee',{action:'status',revision:0,sale:true,grant:false})).status,200);
 assert.equal((await apply(f,'archive',[target('coffee',1)])).body.items[0].status,'success');
 assert.equal((await apply(f,'unarchive',[target('coffee',2)])).body.items[0].status,'success');
 assert.equal((await productBy(f,'coffee')).dispatch_available,false);
});

test('mixed deletion confirms eligible products once and preserves even expired or indirect references',async t=>{
 const f=await fixture(t,{...scope,ADMIN_USER_IDS:'owner,other'});
 const create=async(name,extra={})=>{
  const result=await mutate(f,null,bodyFor({name,...extra}));
  assert.equal(result.status,201,JSON.stringify(result.body));
  return result.body.id;
 };
 const clean=await create('삭제 후보'),used=await create('보유 이력');
 const room=await create('방 설정',{type:'theme',options:{P7D:10},uiMode:'dark'}),late=await create('확인 후 참조');
 const holdings=product=>f.sql.prepare(`INSERT INTO gift_inventory
  (id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created,used_at,expires_at)
  VALUES(?,'other',?,'사용한 선물','gold',0,'purchase',?,0,1,2,3)`).run(key(),product,key());
 holdings(used);
 f.sql.prepare("INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES('room','owner',?,1,1)").run(room);
 const version=key();
 f.sql.prepare(`INSERT INTO product_asset_versions(product_id,id,label,mode,renderer,files,originals,hash,created)
  VALUES(?,?,'1.0.0','static','gift-standard','{}','{}','shared',1)`).run(clean,version);
 const candidates=[target(clean,1),target(used,1),target(room,1),target(late,1),target('heart')];
 const pending=await apply(f,'delete_request',candidates);
 assert.ok(pending.body.items.every(item=>item.status==='success'));
 assert.equal((await f.call(root+'?deletion=1')).body.total,5);
 assert.equal((await f.call('/api/gifts/catalog')).body.gifts.some(item=>item.id==='heart'),false);
 const items=candidates.map(item=>target(item.id,item.revision+1));
 assert.equal((await operate(f,{action:'delete',items,preview:true},null)).status,401);
 assert.equal((await operate(f,{action:'delete',items,preview:true},'other')).status,403);
 const preview=await operate(f,{action:'delete',items,preview:true});
 assert.equal(preview.status,200,JSON.stringify(preview.body));
 assert.deepEqual(preview.body.items.map(x=>x.status),['eligible','excluded','excluded','eligible','excluded']);
 assert.match(preview.body.items[1].reason,/보유 이력/);
 assert.match(preview.body.items[2].reason,/방 설정/);
 assert.equal((await productBy(f,used)).holders,0);
 holdings(late);
 const operation={action:'delete',items,confirmed_ids:[clean,late],request_id:key()};
 const [first,retry]=await Promise.all([operate(f,operation),operate(f,operation)]);
 for(const result of [first,retry]){
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.deepEqual(result.body.items.map(x=>x.status),['success','excluded','excluded','excluded','excluded']);
 }
 assert.equal(Number(first.body.replayed)+Number(retry.body.replayed),1);
 assert.equal((await operate(f,{...operation,confirmed_ids:[clean]})).status,409);
 assert.equal((await f.call(root+'/'+clean)).status,404);
 assert.equal((await f.call(root+'?q='+clean)).body.total,0);
 assert.equal(table(f,'product_asset_versions').find(v=>v.id===version).hash,'shared');
 const audit=table(f,'admin_audit').filter(row=>row.action==='product_delete');
 assert.equal(audit.length,1);
 assert.equal(JSON.parse(audit[0].target).result.items[0].status,'success');
 assert.equal(table(f,'gift_inventory').length,2);
 assert.equal((await apply(f,'delete_cancel',[target('heart',1)])).body.items[0].status,'success');
 assert.equal((await f.call('/api/gifts/catalog')).body.gifts.some(item=>item.id==='heart'),true);
});

test('a reference added during deletion is checked inside the write batch',async t=>{
 const f=await fixture(t,scope),{body:{id}}=await mutate(f,null,bodyFor({type:'theme',options:{P7D:1},uiMode:'dark'}));
 assert.equal((await apply(f,'delete_request',[target(id,1)])).body.items[0].status,'success');
 const original=f.DB.batch.bind(f.DB);
 f.DB.batch=statements=>{
  f.sql.prepare("INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES('late-room','owner',?,1,1)").run(id);
  return original(statements);
 };
 const result=await apply(f,'delete',[target(id,2)]);
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.items[0].status,'failed');
 assert.equal((await f.call(root+'/'+id)).status,200);
});

test('native product links authorize one read-only preview and become stale on a product revision',async t=>{
 const f=await fixture(t,{...scope,AIFECT_PRODUCT_REVIEW_KEY:'isolated-product-review-test-key-00001'});
 const endpoint='/api/admin/product-native-review',input={id:'heart',surface:'shop',platform:'android'};
 assert.equal((await f.call(endpoint,'POST',input,'other')).status,403);
 const response=await f.call(endpoint,'POST',input);
 assert.equal(response.status,201,JSON.stringify(response.body));
 const ticket=new URL(response.body.open_url).searchParams.get('ticket'),path='/api/product-review/'+ticket+'/data';
 const data=await f.call(path,'GET',undefined,null);
 assert.equal(data.status,200);
 assert.equal(data.body.platform,'android');
 assert.equal(data.body.wallet.gifts[0].id,'heart');
 assert.equal((await f.call(path,'POST',{},null)).status,405);
 const altered=ticket.replace(/\.(.)/,(_,first)=>'.'+(first==='a'?'Q':'a'));
 assert.equal((await f.call('/api/product-review/'+altered+'/data','GET',undefined,null)).status,404);
 await apply(f,'sale_stop',[target('heart')]);
 assert.equal((await f.call(path,'GET',undefined,null)).status,409);
});

test('multipart draft creation keeps sources, deduplicates retries and leaves the product intact on upload failure',async t=>{
 const f=await fixture(t,scope);
 const png=readFileSync(new URL('../dist/assets/gifts/lollipop.png',import.meta.url));
 const webp=readFileSync(new URL('../dist/assets/gifts/heart.webp',import.meta.url));
 const info={format:'webp',width:512,height:512,frames:1,alpha:true};
 t.mock.method(globalThis,'fetch',async url=>{
  assert.match(url,/^https:\/\/billing\.aifect\.co\.kr\/aifect-origin\/v1\/product-/);
  return url.endsWith('product-inspect')?Response.json({...info,format:'png'}):
   new Response(webp,{headers:{'x-aifect-image':JSON.stringify(info)}});
 });
 const objects=new Map();
 let storageAvailable=true;
 const env={...scope,DB:f.DB,CAFE24_ORIGIN_KEY:'isolated-image-test',BUCKET:{
  async put(k,v){if(!storageAvailable)throw Object.assign(new Error('Fixture storage unavailable'),{status:503});objects.set(k,v);},
  async delete(k){objects.delete(k);}
 }};
 const send=async(path,body,request,version='1.0.0',mime='image/png')=>{
  const form=new FormData();
  form.set('definition',JSON.stringify(body));form.set('request_id',request);
  form.set('asset_version',version);form.set('mode','static');
  form.set('base',new Blob([png],{type:mime}),'source.png');
  const result=await worker.fetch(new Request('https://aifect.test'+path,{method:'POST',body:form,
   headers:{origin:'https://aifect.test',cookie:'aifect_session=owner'}}),env,{waitUntil(p){p.catch(()=>{});}});
  return {status:result.status,body:await result.json()};
 };
 const metadata=bodyFor({distribution:'grant',value:null,options:{}});
 const request=key();
 const [a,b]=await Promise.all([send(root,metadata,request),send(root,metadata,request)]);
 for(const result of [a,b])assert.equal(result.status,201,JSON.stringify(result.body));
 assert.equal(a.body.id,b.body.id);
 const [version]=table(f,'product_asset_versions');
 assert.equal(version.id,request);
 assert.equal(table(f,'product_catalog').length,1);
 assert.equal(table(f,'product_catalog')[0].active_version,null);
 assert.equal(objects.size,3);
 assert.deepEqual(Buffer.from(objects.get(JSON.parse(version.originals).base.key)),png);
 assert.deepEqual(Buffer.from(objects.get(JSON.parse(version.files).base.key)),webp);
 const edit={...metadata,action:'edit',revision:1,name:'바뀐 이름'};
 assert.equal((await send(root+'/'+a.body.id,edit,key(),'1.1.0','text/plain')).status,400);
 storageAvailable=false;
 assert.equal((await send(root+'/'+a.body.id,edit,key(),'1.1.0')).status,503);
 assert.equal(table(f,'product_asset_versions').length,1);
 assert.equal((await productBy(f,a.body.id)).name,metadata.name);
 assert.equal(objects.size,3);
});

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
