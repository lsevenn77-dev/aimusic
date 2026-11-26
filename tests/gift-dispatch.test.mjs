import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {DECORATIONS} from '../shared/decorations.js';
import {GIFT_CATALOG,SILVER_GIFT_CATALOG} from '../shared/gifts.js';

const base='/api/admin/gift-dispatch';
const scope={ADMIN_USER_IDS:'owner,other',AIFECT_GIFT_DISPATCH_OPERATOR_IDS:'owner',
 AIFECT_GIFT_DISPATCH_ADJUSTER_IDS:'owner',AIFECT_PRODUCT_EDITOR_IDS:'owner'};
const gift=GIFT_CATALOG.find(p=>p.id==='heart').id;
const silver=SILVER_GIFT_CATALOG[0].id;
const frame=Object.values(DECORATIONS).find(p=>p.kind==='PROFILE_FRAME').sku;
const theme=Object.values(DECORATIONS).find(p=>p.kind==='TALKING_ROOM_THEME').sku;
const item=(product_id=gift,more={})=>({product_id,option:'unit',quantity:1,revision:0,...more});
const payload=(products=[item()],ids=['other'],more={})=>({
 audience:{type:'specific',ids},origin:'admin',reason:'QA 내부 지급 사유',message:'따뜻한 선물을 보내드립니다.',products,...more
});
const post=(f,part,body={},uid='owner')=>f.call(base+part,'POST',body,uid);
const clause=(f,sql,...args)=>f.sql.prepare(sql).all(...args);
const valid=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const fixed=(days=5)=>new Date(Date.now()+(days*86400+9*3600)*1000).toISOString().slice(0,10);
const markMember=(f,id,provider='email',account_type='human')=>f.sql.prepare(
 'INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,?,?,unixepoch())'
).run(id,id+'@example.test',id,provider,account_type);
async function preview(f,data){
 return valid(await post(f,'/preview',data),201);
}
async function process(f,id){
 for(let n=0;n<12;n++){
  const out=valid(await post(f,'/'+id+'/process'));
  if(!out.pending&&!out.notices_pending)return out;
 }
 assert.fail('The dispatch did not complete');
}
async function dispatch(f,data){
 const draft=await preview(f,data);
 valid(await post(f,'/'+draft.id+'/confirm'));
 await process(f,draft.id);
 return draft;
}
const details=async(f,id)=>valid(await f.call(base+'/'+id));

test('shared targets exclude AI and closed accounts, preserve ID strings and require reconfirmation of an equal-count change',async t=>{
 const f=await fixture(t,scope);
 markMember(f,'ai_999901','ai_service','ai_bot');
 markMember(f,'gone','deleted');
 markMember(f,'000012');
 const input=payload([item()],[],{audience:{type:'all'}});
 assert.equal((await post(f,'/preview',input,'other')).status,403);
 assert.equal((await f.call(base,'GET',undefined,null)).status,401);
 assert.equal((await post(f,'/preview',payload([item()],[]))).status,400);
 assert.equal((await post(f,'/preview',payload([item()],['gone','ai_999901']))).body.id,null);
 const a=await preview(f,input);
 assert.deepEqual(a.check.members.map(x=>x.id),['000012','other','owner']);
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='000012'");
 markMember(f,'000013');
 assert.equal((await post(f,'/'+a.id+'/confirm')).status,409);
 const b=await preview(f,{...input,previous_check:a.check.id});
 assert.deepEqual(b.check.change,{added:{count:1,ids:['000013']},removed:{count:1,ids:['000012']}});
 assert.equal(b.check.count,a.check.count);
 assert.equal((await preview(f,payload([item()],['other','other','gone']))).check.duplicates,1);
 valid(await post(f,'/'+b.id+'/confirm'));
 await process(f,b.id);
 assert.deepEqual(clause(f,'SELECT DISTINCT user_id FROM gift_dispatch_items WHERE dispatch_id=? ORDER BY user_id',b.id).map(x=>x.user_id),['000013','other','owner']);
 const audit=clause(f,"SELECT action FROM admin_audit WHERE action='gift_dispatch:confirm'");
 assert.equal(audit.length,1);
});

test('multiple product lots preserve payment balance, KST deadlines, receipt permissions and retry identity',async t=>{
 const f=await fixture(t,scope);
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('other',23)");
 const date=fixed();
 assert.equal((await post(f,'/preview',payload([item()],['other'],{origin:'event'}))).status,400);
 const a=await preview(f,payload([
  item(gift,{quantity:3,deadline:{mode:'date',date}}),
  item(silver,{quantity:2,deadline:{mode:'none'}})
 ],['other'],{origin:'event'}));
 assert.equal(a.quantity,5);
 const result=await Promise.all([post(f,'/'+a.id+'/confirm'),post(f,'/'+a.id+'/confirm')]);
 result.forEach(r=>valid(r));
 await Promise.all([process(f,a.id),process(f,a.id)]);
 const rights=clause(f,'SELECT * FROM gift_inventory WHERE user_id=?','other');
 assert.equal(rights.length,5);
 assert.ok(rights.every(r=>r.currency==='reward'&&r.value===0&&JSON.parse(r.grant_terms).settlement==='excluded'));
 assert.ok(rights.filter(r=>r.gift_type===gift).every(r=>r.expires_at===Date.parse(date+'T00:00:00+09:00')/1000+86400));
 assert.ok(rights.filter(r=>r.gift_type===silver).every(r=>r.expires_at===null));
 assert.equal(clause(f,'SELECT balance FROM free_gift_wallets')[0].balance,23);
 assert.equal(clause(f,'SELECT * FROM gift_inventory_lots').length,0);
 const notice=valid(await f.call('/api/notices/official','GET',undefined,'other')).items.find(x=>x.gift);
 assert.ok(notice.rich.blocks.some(b=>b.thumbnail&&b.runs[0].text.includes('× 3')));
 assert.ok(notice.rich.blocks.some(b=>b.runs[0].href==='#inventory'));
 assert.ok(!JSON.stringify(notice).includes('QA 내부 지급 사유'));
 assert.equal(valid(await f.call('/api/notices/official?known='+encodeURIComponent(notice.id),'GET')).items.length,0);
 valid(await f.call('/api/notices/official','PATCH',{ids:[notice.id]},'other'));
 assert.equal((await details(f,a.id)).ready,5);
 assert.equal((await details(f,a.id)).notices_sent,1);
});

test('FEFO consumes the earlier zero-value unit and keeps the submitted identity on replay; recall and extension are scoped',async t=>{
 const f=await fixture(t,scope);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('qa-gold','other','web',500,5000,0,'paid',0,1)");
 valid(await f.call('/api/me/gift-inventory/buy','POST',{gift_type:gift,quantity:1,request_id:crypto.randomUUID()},'other'),201);
 const purchase=clause(f,"SELECT * FROM gift_inventory WHERE source='purchase'")[0];
 const later=await dispatch(f,payload([item(gift,{quantity:2,deadline:{mode:'days',days:30}})]));
 const earlier=await dispatch(f,payload([item(gift,{quantity:2,deadline:{mode:'days',days:7}})]));
 const requested=clause(f,"SELECT id FROM gift_inventory WHERE dispatch_item IN (SELECT id FROM gift_dispatch_items WHERE dispatch_id=?) ORDER BY id",later.id)[0].id;
 const send='/api/me/gift-inventory/'+requested+'/send',message={profile_id:'producer',request_id:crypto.randomUUID()};
 const recall=await post(f,'/'+earlier.id+'/adjustments',{kind:'recall',ids:null,reason:'QA 지급 조정'});
 assert.equal(recall.status,200,JSON.stringify(recall.body));
 valid(await f.call(send,'POST',message,'other'));
 valid(await f.call(send,'POST',message,'other'));
 assert.equal(clause(f,'SELECT count(*) n FROM free_gifts WHERE silver=0')[0].n,1);
 assert.equal((await details(f,earlier.id)).used,1);
 assert.equal((await details(f,later.id)).used,0);
 assert.equal((await post(f,'/'+earlier.id+'/adjustments/'+recall.body.id)).status,409);
 const extension=valid(await post(f,'/'+earlier.id+'/adjustments',{kind:'extend',ids:['other'],date:fixed(14),reason:'QA 기한 연장'}));
 assert.equal(extension.quantity,1);
 valid(await post(f,'/'+earlier.id+'/adjustments/'+extension.id));
 const next=valid(await post(f,'/'+earlier.id+'/adjustments',{kind:'recall',ids:['other'],reason:'QA 잔여 회수'}));
 assert.equal(next.quantity,1);
 valid(await post(f,'/'+earlier.id+'/adjustments/'+next.id));
 valid(await post(f,'/'+earlier.id+'/adjustments/'+next.id));
 const run=await details(f,earlier.id);
 assert.equal(run.used,1);
 assert.equal(run.recalled,1);
 assert.equal(run.adjustments.length,2);
 assert.deepEqual(clause(f,"SELECT * FROM gift_inventory WHERE source='purchase'")[0],purchase);
 assert.equal((await details(f,later.id)).ready,2);
 const notices=valid(await f.call('/api/notices/official','GET',undefined,'other')).items;
 assert.ok(notices.some(n=>JSON.stringify(n.rich).includes('회수 완료')));
});

test('granted decoration stock activates independently from existing paid stock and expired stock cannot activate',async t=>{
 const f=await fixture(t,scope);
 for(const sku of [frame,theme])valid(await f.call('/api/admin/products/'+sku,'POST',{
  action:'status',revision:0,sale:true,grant:true,request_id:crypto.randomUUID()
 }));
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('qa-decoration','other','web',2500,25000,0,'paid',0,1)");
 valid(await f.call('/api/decorations/buy','POST',{sku:frame,period:'P7D',request_id:crypto.randomUUID()},'other'),201);
 const paid=clause(f,"SELECT * FROM player_inventory WHERE user_id='other' AND source='decoration_stock'")[0];
 const a=await dispatch(f,payload([
  item(frame,{option:'P7D',revision:1,deadline:{mode:'days',days:2}}),
  item(theme,{option:'P7D',revision:1,deadline:{mode:'days',days:3},season_date:fixed(1)})
 ]));
 const rights=clause(f,'SELECT * FROM player_inventory WHERE dispatch_item IS NOT NULL ORDER BY item_key');
 const grantedFrame=rights.find(p=>p.item_key===frame),grantedTheme=rights.find(p=>p.item_key===theme);
 assert.equal(grantedFrame.redeem_before-grantedFrame.granted_at,2*86400);
 assert.equal(grantedTheme.redeem_before,grantedTheme.season_ends_at);
 const use='/api/decorations/inventory/'+grantedFrame.id+'/use';
 const activation=valid(await f.call(use,'POST',{request_id:crypto.randomUUID(),equip:true},'other')).receipt;
 assert.ok(activation.expires_at>grantedFrame.redeem_before);
 assert.equal(activation.active_inventory_id,'grant-active-'+grantedFrame.id);
 f.sql.prepare('UPDATE player_inventory SET redeem_before=unixepoch() WHERE id=?').run(grantedTheme.id);
 assert.equal((await f.call('/api/decorations/inventory/'+grantedTheme.id+'/use','POST',{request_id:crypto.randomUUID()},'other')).status,409);
 const run=await details(f,a.id);
 assert.equal(run.used,1);assert.equal(run.expired,1);
 assert.deepEqual(clause(f,'SELECT * FROM player_inventory WHERE id=?',paid.id)[0],paid);
});

test('a permanent entitlement is excluded at preview and a new duplicate requires confirmation again',async t=>{
 const f=await fixture(t,scope);
 const update='/api/admin/products/'+frame;
 valid(await f.call(update,'POST',{action:'edit',revision:0,name:'격리 영구 이용권',distribution:'grant',
  options:{PERMANENT:200},value:200,eventOnly:false,grantDeadline:{mode:'days',days:7},request_id:crypto.randomUUID()}));
 valid(await f.call(update,'POST',{action:'status',revision:1,sale:false,grant:true,request_id:crypto.randomUUID()}));
 const input=payload([item(frame,{option:'PERMANENT',revision:2})]);
 const a=await preview(f,input);
 await dispatch(f,input);
 assert.equal((await post(f,'/'+a.id+'/confirm')).status,409);
 const b=await preview(f,input);
 assert.equal(b.quantity,0);
 assert.equal(b.products[0].excluded,1);
 const stock=clause(f,'SELECT * FROM player_inventory WHERE dispatch_item IS NOT NULL')[0];
 const use='/api/decorations/inventory/'+stock.id+'/use';
 const receipt=valid(await f.call(use,'POST',{request_id:crypto.randomUUID(),equip:true},'other')).receipt;
 assert.equal(receipt.expires_at,0);
 assert.ok(valid(await f.call('/api/decorations','GET',undefined,'other')).inventory.some(i=>i.id===receipt.active_inventory_id&&i.available));
 assert.equal((await preview(f,input)).products[0].excluded,1);
});

test('a mid-batch DB error rolls back inventory and a notice failure retries independently of successful units',async t=>{
 const f=await fixture(t,scope);
 const a=await preview(f,payload([item(gift,{quantity:2})],['other','owner']));
 valid(await post(f,'/'+a.id+'/confirm'));
 f.sql.exec("CREATE TRIGGER qa_dispatch_inventory BEFORE INSERT ON gift_inventory WHEN new.unit=1 BEGIN SELECT RAISE(ABORT,'fixture inventory break'); END");
 assert.equal((await post(f,'/'+a.id+'/process')).status,500);
 assert.equal(clause(f,'SELECT * FROM gift_inventory').length,0);
 assert.equal((await details(f,a.id)).pending,2);
 f.sql.exec("DROP TRIGGER qa_dispatch_inventory; UPDATE users SET provider='deleted' WHERE id='owner'");
 // Keep a distinct authorized operator for the simulation of member retirement.
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='other'; UPDATE users SET provider='email' WHERE id='owner'");
 f.sql.exec("CREATE TRIGGER qa_dispatch_notice BEFORE INSERT ON welcome_receipts WHEN new.campaign_id LIKE 'gift-%' BEGIN SELECT RAISE(ABORT,'fixture receipt break'); END");
 await process(f,a.id);
 let detail=await details(f,a.id);
 assert.equal(detail.failed,1);assert.equal(detail.granted_units,2);assert.equal(detail.notices_failed,1);
 f.sql.exec("DROP TRIGGER qa_dispatch_notice; UPDATE users SET provider='email' WHERE id='other'");
 valid(await post(f,'/'+a.id+'/notify'));
 const input={request_id:crypto.randomUUID(),ids:['other']};
 valid(await post(f,'/'+a.id+'/retry',input));
 await process(f,a.id);
 valid(await post(f,'/'+a.id+'/retry',input));
 detail=await details(f,a.id);
 assert.equal(detail.granted_units,4);assert.equal(detail.notices_sent,2);assert.equal(detail.failed,0);
 assert.equal(clause(f,'SELECT * FROM gift_inventory').length,4);
});

test('test dispatch is accepted only for an explicitly configured isolated account',async t=>{
 const input=payload([item()],['owner'],{test:true});
 const unconfigured=await fixture(t,scope);
 assert.equal((await post(unconfigured,'/preview',input)).status,403);
 const f=await fixture(t,{...scope,AIFECT_GIFT_DISPATCH_TEST_MODE:'true',AIFECT_NOTICE_TEST_ACCOUNTS:'{"owner":"other"}'});
 const a=await dispatch(f,input);
 assert.deepEqual(clause(f,'SELECT user_id FROM gift_inventory').map(row=>row.user_id),['other']);
 assert.equal(valid(await f.call(base)).jobs.length,0);
 assert.equal(valid(await f.call(base+'?test=1')).jobs[0].id,a.id);
});
