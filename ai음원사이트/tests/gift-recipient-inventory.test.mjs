import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {giftBrowser} from './gift-popup-fixture.mjs';
import {nicknameContext} from './nickname-context.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function setup(t) {
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created) VALUES('paid','owner','web',500,5000,0,'paid',0); INSERT INTO free_gift_wallets VALUES('owner',100)");
 const result=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity:2,request_id:crypto.randomUUID()});
 assert.equal(result.status,201);
 const calls=[];
 const api=async(path,method='GET',body,options)=>{
  calls.push({path,method,body,options});const r=await f.call(path,method,body);
  if(r.status>=400)throw Error(r.body.error);return r.body;
 };
 const b=giftBrowser(api);
 return {f,b,calls,writes:()=>calls.filter(x=>x.method==='POST')};
}
test('gift picker uses catalog currency groups, fresh stock and shared balances',async t=>{
 const {b,calls,writes}=await setup(t);await b.open();
 assert.match(b.html,/<h2>선물하기<\/h2>/);assert.equal((b.html.match(/data-gift-category=/g)||[]).length,4);
 const catalog=(await b.c.api('/api/gold'));
 const ids=Array.from(b.html.matchAll(/data-gift-type="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(ids,[...catalog.gifts,...catalog.silver_gifts].map(g=>g.id));
 assert.match(b.html,/골드 400/);assert.match(b.html,/실버 100/);assert.match(b.html,/×2/);
 assert.match(b.html,/class="gift-charge-button"[^>]*><span>충전하기<\/span>/);
 assert.equal(calls.find(x=>x.path==='/api/me/gift-inventory').options.fresh,true);
 assert.equal(writes().length,0);
 await b.tab('inventory');assert.equal(b.nodes['#gift-send'].disabled,true);
 const owned=(await b.c.api('/api/me/gift-inventory')).items[0];await b.click('ownedGift',owned.id);
 assert.equal(b.nodes['#gift-quantity'].disabled,false);
 b.setQuantity(3);assert.equal(b.nodes['#gift-send'].disabled,true);
 b.setQuantity(2);assert.equal(b.nodes['#gift-send'].disabled,false);
 await b.tab('gifts');assert.equal(b.nodes['#gift-quantity'].value,'1');
});
test('owned batch confirms quantity, cancellation and response-loss replay without another payment',async t=>{
 const {b,f,writes}=await setup(t);const ids=(await b.c.api('/api/me/gift-inventory')).items.map(x=>x.id);
 await b.open({giftInventoryId:ids[1]});b.setQuantity(2);
 b.decisions.push(false);await b.submit();assert.equal(writes().length,0);assert.equal(b.modal.open,true);
 const api=b.c.api;let lose=true;
 b.c.api=async(...args)=>{const value=await api(...args);if(args[1]==='POST'&&lose){lose=false;throw Error('연결 오류');}return value;};
 await b.submit();assert.match(b.form.error.textContent,/연결/);assert.equal(b.nodes['#gift-quantity'].value,'2');
 await b.submit();const [first,retry]=writes();assert.deepEqual(first,retry);
 assert.deepEqual(Array.from(first.body.inventory_ids),[ids[1],ids[0]]);assert.equal(first.body.from_profile,true);
 assert.deepEqual(b.reviews.map(v=>[v.quantity,v.recipient,v.amount]),[[2,'친구',undefined],[2,'친구',undefined],[2,'친구',undefined]]);
 assert.equal((await f.call('/api/me/gift-inventory')).body.items.length,0);
 assert.equal((await f.call('/api/gold/balance')).body.balance,400);assert.equal(b.modal.open,false);
 assert.deepEqual(b.notices,['선물을 보냈습니다.']);assert.deepEqual(b.updates,['aifect:inventory-changed']);
});
test('immediate purchase confirms exact currency and price and resends only the original request',async t=>{
 const {b,f,writes}=await setup(t);await b.open('silver-letter');const api=b.c.api;
 let lost=true;b.c.api=async(...args)=>{const result=await api(...args);if(args[1]==='POST'&&lost){lost=false;throw Error('연결 오류');}return result;};
 b.setQuantity(5);b.decisions.push(false);await b.submit();assert.equal(writes().length,0);
 await b.submit();assert.match(b.form.error.textContent,/연결/);assert.equal(b.nodes['#gift-send'].disabled,false);
 await b.submit();assert.deepEqual(writes()[0],writes()[1]);assert.equal(writes()[0].path,'/api/producers/friend/gifts');
 assert.equal(b.reviews.at(-1).amount,10);assert.equal(b.reviews.at(-1).currency,'S');assert.equal(b.reviews.at(-1).quantity,5);
 assert.equal((await f.call('/api/gold/balance')).body.silver_balance,90);
});
test('refund-restricted, unknown and received stock cannot be selected',async t=>{
 const {b,f,writes}=await setup(t);
 f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('paid','owner','fixture-refund','refund_review',0,1,0)");
 await b.open({giftInventoryId:'missing'});assert.doesNotMatch(b.html,/data-owned-gift=/);
 assert.equal(b.nodes['#gift-send'].disabled,true);await b.submit();assert.equal(writes().length,0);
 const groups=b.c.ownedGiftGroups([{id:'x',gift_type:'heart',available:true,giftable:false},{id:'y',gift_type:'heart',available:true}]);
 assert.equal(groups.length,0);
});
test('recipient changes preserve stored unit identity, selected quantity and account checks',async t=>{
 const {b,writes}=await setup(t);const id=(await b.c.api('/api/me/gift-inventory')).items[1].id;
 const opened=[];b.c.chooseGiftRecipient=s=>opened.push(s);
 await b.open({giftInventoryId:id});b.setQuantity(2);await b.nodes['#gift-recipient'].onclick();
 assert.equal(opened[0].giftInventoryId,id);assert.equal(opened[0].quantity,2);
 b.c.me={id:'other'};await b.submit();assert.match(b.form.error.textContent,/계정이 변경/);assert.equal(writes().length,0);
});
test('room gifts retain their supplied transport, pending guard and recipient restrictions',async t=>{
 const {b,calls,writes}=await setup(t);let release;const pending=new Promise(r=>release=r);const sent=[];
 const roomGift={recipients:[{id:'friend'}],async send(body){sent.push(body);await pending;}};
 await b.open({id:'heart',quantity:2,roomGift});
 for(const key of ['frames','themes','inventory'])assert.match(b.html,new RegExp('data-gift-category="'+key+'" aria-pressed="false" disabled'));
 assert.ok(!calls.some(x=>x.path.includes('gift-inventory')));assert.match(b.nodes['#gift-detail'].textContent,/토킹룸에서는 골드/);
 const first=b.submit();await new Promise(r=>setImmediate(r));assert.equal(b.nodes['#gift-send'].disabled,true);
 await b.submit();assert.equal(sent.length,1);release();await first;assert.equal(sent[0].quantity,2);assert.equal(sent[0].profile_id,'friend');
 assert.equal(writes().length,0);assert.deepEqual(b.notices,['선물을 보냈습니다.']);
 const before=calls.length;await b.c.profileGiftDialog('outside',{id:'heart',roomGift});assert.equal(calls.length,before);
});
test('work and profile entry retain the actual recipient, artwork and source attribution',async t=>{
 const {b,f,writes}=await setup(t);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('friend-artist','friend','Guest artist',0);UPDATE tracks SET user_id='other',producer_id='friend',artist_id='friend-artist' WHERE id='one'");
 await b.c.giftDialog('one','silver-letter');await b.submit();assert.equal(writes()[0].path,'/api/tracks/one/gifts');
 const id=(await b.c.api('/api/me/gift-inventory')).items[0].id;
 await b.c.giftDialog('one',{giftInventoryId:id});await b.submit();assert.equal(writes()[1].body.track_id,'one');
 const notices=(await f.call('/api/notifications?filter=gifts','GET',null,'other')).body.items;
 for(const item of notices)assert.deepEqual([item.source_type,item.source_id],['work','one']);
});
test('inventory read failures leave purchases usable and guest views never request private inventory',async()=>{
 const profile={profile:{id:'friend',user_id:'other',name:'친구'}};
 const b=giftBrowser(async p=>{if(p.includes('gift-inventory'))throw Error('offline');return p==='/api/gold'?{balance:500,free:{balance:5}}:profile;});
 await b.open();assert.match(b.html,/data-gift-inventory-retry/);assert.equal(b.nodes['#gift-send'].disabled,false);
 const calls=[];const guest=giftBrowser(async p=>{calls.push(p);return profile;},null);await guest.open();
 assert.ok(!calls.some(p=>p.includes('gift-inventory')));
});
test('profile more button opens its preview and only other profiles expose the gift entry',()=>{
 const handlers={};const c=nicknameContext({me:{id:'self'},esc:String,number:String,icon:()=>'',avatarImage:()=>'',document:{addEventListener:(type,fn)=>handlers[type]=fn},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/player-progress.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../dist/profile-preview.js',import.meta.url),'utf8'),c);
 const profile={id:'friend',user_id:'other',name:'친구'};
 assert.match(c.profilePreviewHTML({profile}),/data-preview-gift="friend"/);
 assert.doesNotMatch(c.profilePreviewHTML({profile:{...profile,user_id:'self'}}),/data-preview-gift/);
 const opened=[];c.openProfilePreview=(id)=>opened.push(id);
 const button={dataset:{profilePreview:'friend'},closest:s=>s==='[data-profile-preview]'||s==='button'?button:null};
 handlers.click({target:button,button:0,preventDefault(){},stopImmediatePropagation(){}});assert.deepEqual(opened,['friend']);
});
