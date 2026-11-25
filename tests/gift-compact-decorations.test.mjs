import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {giftBrowser} from './gift-popup-fixture.mjs';

async function setup(t) {
 const f=await decorationsFixture(t);
 const calls=[];
 const api=async(path,method='GET',body,options)=>{
  calls.push({path,method,body,options});const result=await f.call(path,method,body);
  if(result.status>=400)throw Error(result.body.error);
  return result.body;
 };
 return {f,b:giftBrowser(api),calls,writes:()=>calls.filter(c=>c.method==='POST')};
}

test('decoration checkout confirms registered period price and atomically gifts in one request',async t=>{
 const {f,b,writes}=await setup(t);
 await b.open({sku:'frame_aurora_ring',period:'P1M'});b.decisions.push(false);
 await b.submit();assert.equal(writes().length,0);assert.equal(b.reviews[0].amount,150);
 await b.submit();const writesDone=writes();assert.equal(writesDone.length,1);
 assert.equal(writesDone[0].path,'/api/decorations/gift');assert.equal(writesDone[0].body.period,'P1M');assert.equal(writesDone[0].body.profile_id,'friend');
 const received=(await f.call('/api/decorations','GET',undefined,'other')).body.inventory[0];
 assert.equal(received.period_code,'P1M');assert.equal(received.expires_at,0);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,150);
 assert.deepEqual(b.notices,['선물을 보냈습니다.']);
});
test('lost checkout response survives changing tabs and retries the same charge',async t=>{
 const {f,b,writes}=await setup(t);
 const api=b.c.api;let lose=true;
 b.c.api=async(...args)=>{const r=await api(...args);if(args[0]==='/api/decorations/gift'&&lose){lose=false;throw Error('응답 연결이 끊겼습니다.');}return r;};
 await b.open({sku:'frame_aurora_ring'});await b.submit();assert.match(b.form.error.textContent,/연결/);
 await b.tab('themes');await b.tab('frames');await b.submit();
 assert.equal(writes().length,2);assert.deepEqual(writes()[0].body,writes()[1].body);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,50);
});
test('inventory tab separates durations and sends only selected transferable units as a batch',async t=>{
 const {f,b,writes}=await setup(t);
 const first=(await f.buy('frame_aurora_ring','P7D')).body.order.inventory_id;
 const second=(await f.buy('frame_aurora_ring','P7D')).body.order.inventory_id;
 const month=(await f.buy('frame_aurora_ring','P1M')).body.order.inventory_id;
 await f.buy('theme_starlight_lounge');
 await b.open({inventoryId:second});
 assert.match(b.form.extras.innerHTML,/<h3>테두리<\/h3>/);assert.match(b.form.extras.innerHTML,/<h3>테마<\/h3>/);
 assert.equal((b.form.extras.innerHTML.match(/data-gift-decoration-index=/g)||[]).length,3);
 assert.match(b.form.extras.innerHTML,/×2/);assert.match(b.form.extras.innerHTML,/×1/);assert.doesNotMatch(b.form.extras.innerHTML,/shop-currency-amount/);
 b.setQuantity(2);await b.submit();assert.equal(writes().length,1);
 assert.equal(writes()[0].path,'/api/decorations/inventory/'+second+'/send');
 assert.deepEqual(Array.from(writes()[0].body.inventory_ids),[second,first]);
 assert.equal(b.reviews[0].amount,undefined);
 const mine=(await f.call('/api/decorations')).body.inventory;
 assert.ok(mine.some(i=>i.id===month));assert.ok(!mine.some(i=>i.id===first||i.id===second));
});
test('a pending confirmation locks all tabs and blocks duplicate decoration submits',async t=>{
 const {b,writes}=await setup(t);
 await b.open({sku:'frame_aurora_ring'});let release;
 b.decisions.push(new Promise(r=>release=r));const pending=b.submit();await b.submit();await b.tab('themes');
 assert.equal(b.form._busy,true);assert.equal(writes().length,0);
 release(true);await pending;
 assert.equal(writes().length,1);assert.equal(writes()[0].body.sku,'frame_aurora_ring');
});
