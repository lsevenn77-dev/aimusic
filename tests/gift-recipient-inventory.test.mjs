import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectGifts from '../shared/gifts.js';
import {fixture} from './fixture.mjs';
const source=readFileSync(new URL('../dist/gifts.js',import.meta.url),'utf8');
const actions=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8');
function node(dataset={}){return {dataset,hidden:false,disabled:false,isConnected:true,innerHTML:'',textContent:'',attributes:{},classList:{add(){},remove(){},toggle(){}},setAttribute(key,value){this.attributes[key]=String(value);},removeAttribute(key){delete this.attributes[key];},scrollIntoView(){}};}
function browser(api,user={id:'owner'}){
 let html='',form,buttons=[],renders=0;
 const nodes={'#dialog':{open:true,classList:{add(){}},close(){this.open=false;}}};
 const c=nicknameContext({bindGiftCategoryTabs:async()=>{},AifectGifts,crypto,me:user,accountReady:Promise.resolve(),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),number:n=>String(n||0),icon:()=>'',remember(){},api,
  $:selector=>nodes[selector]||null,FormData:class{},window:{addEventListener(){},removeEventListener(){}},uploadStage(){},formError:f=>f.error,toast(){},askLogin(){},render:async()=>{renders++;},
  dialog(value){html=value;if(form)form.isConnected=false;if(!value.includes('id="gift-form"'))return;
   form=node();form.error=node();const qty=node();buttons=[];
   for(const match of value.matchAll(/<button\b([^>]*)>/g)){const attrs=match[1],dataset={};for(const a of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[a[1].replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=a[2];const b=node(dataset);b.disabled=/\bdisabled\b/.test(attrs);buttons.push(b);}
   form.querySelectorAll=selector=>buttons.filter(b=>({ '[data-owned-gift]':'ownedGift','[data-gift-type]':'giftType'})[selector] in b.dataset);
   form.querySelector=selector=>selector==='.gift-quantity'?qty:selector==='.form-error'?form.error:selector.startsWith('button[type=')?nodes['#gift-send']:null;
   nodes['#gift-form']=form;for(const id of ['gift-send-summary','gift-send','gift-quantity','gift-send-notice','gift-owned-cancel','gift-detail','gift-decoration-detail','gift-recipient','gift-balance-g','gift-balance-s'])nodes['#'+id]=node();
  }});
 vm.runInContext(actions.slice(actions.indexOf('function busyForm('),actions.indexOf('function bindUploadForm(')),c);vm.runInContext(source,c);
 return {c,nodes,get html(){return html;},get renders(){return renders;},get form(){return form;},button:(key,value)=>buttons.find(b=>b.dataset[key]===value),submit:()=>form.onsubmit({preventDefault(){},submitter:nodes['#gift-send']})};
}
async function setup(t,{lost=false}={}){
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created) VALUES('paid','owner','web',500,5000,0,'paid',0); INSERT INTO free_gift_wallets VALUES('owner',100)");
 const bought=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity:2,request_id:crypto.randomUUID()});assert.equal(bought.status,201);
 const calls=[];let lose=lost;
 const b=browser(async(path,method='GET',body,options)=>{calls.push({path,method,body,options});const r=await f.call(path,method,body);if(r.status>=400)throw Object.assign(new Error(r.body.error),{status:r.status});if(lose&&path.endsWith('/send')){lose=false;throw Error('응답 연결이 끊겼어요');}return r.body;});return {f,b,calls};
}
test('compact recipient sheet fetches owned gifts fresh and uses one quantity control and shared checkout',async t=>{
 const {b,calls}=await setup(t);await b.c.profileGiftDialog('friend');
 assert.match(b.html,/gift-dialog--compact/);assert.match(b.html,/<h2>선물하기<\/h2>/);
 assert.doesNotMatch(b.html,/구매해서 보내기|data-gift-quantity|data-gift-step/);
 assert.equal((b.html.match(/class="gift-footer-grid"/g)||[]).length,1);
 assert.equal((b.html.match(/<select id="gift-quantity"/g)||[]).length,1);
 assert.match(b.html,/id="gift-balance-g">400 G/);assert.match(b.html,/id="gift-balance-s">100 S/);
 assert.equal((b.html.match(/data-owned-gift=/g)||[]).length,1);assert.match(b.html,/보유 2개/);
 assert.equal(calls.find(r=>r.path==='/api/me/gift-inventory').options.fresh,true);
 assert.equal(b.nodes['#gift-send'].textContent,'선물하기');assert.match(b.nodes['#gift-send'].attributes['aria-label'],/보유 선물 1개 보내기/);assert.equal(b.nodes['#gift-quantity'].disabled,true);
 assert.equal(calls.filter(r=>r.method==='POST').length,0);
});
test('owned send confirms, retries the same request after a lost response, spends once and refreshes inventory',async t=>{
 const {b,f,calls}=await setup(t,{lost:true});await b.c.profileGiftDialog('friend');
 await b.submit();assert.equal(b.nodes['#gift-send'].textContent,'확인하고 보내기');assert.equal(calls.filter(r=>r.method==='POST').length,0);
 await b.submit();assert.match(b.form.error.textContent,/연결/);await b.submit();
 const sent=calls.filter(r=>r.path.endsWith('/send'));assert.equal(sent.length,2);assert.deepEqual(sent[0].body,sent[1].body);
 assert.deepEqual(Object.keys(sent[0].body).sort(),['from_profile','profile_id','request_id']);assert.equal(sent[0].body.profile_id,'friend');
 assert.equal(sent[0].body.from_profile,true);
 assert.equal(f.sql.prepare('SELECT source_type FROM gift_sources').get().source_type,'profile');
 assert.equal((await f.call('/api/gold/balance')).body.balance,400);assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert.match(b.html,/추가 차감 없음/);assert.equal(b.renders,1);
 await b.c.profileGiftDialog('friend');assert.match(b.html,/보유 1개/);
});
test('switching to purchase uses existing catalog and currency endpoint; invalid quantity cannot block owned send',async t=>{
 const {b,f,calls}=await setup(t);await b.c.profileGiftDialog('friend');
 b.button('giftType','silver-letter').onclick();assert.equal(b.nodes['#gift-quantity'].disabled,false);
 b.nodes['#gift-quantity'].value='5';b.nodes['#gift-quantity'].onchange();await b.submit();
 assert.equal(calls.filter(r=>r.method==='POST')[0].path,'/api/producers/friend/gifts');assert.equal((await f.call('/api/gold/balance')).body.silver_balance,90);
 assert.equal((await f.call('/api/me/gift-inventory')).body.items.length,2);
 await b.c.profileGiftDialog('friend','heart');b.nodes['#gift-quantity'].value='0';b.nodes['#gift-quantity'].oninput();assert.equal(b.nodes['#gift-send'].disabled,true);
 const item=(await f.call('/api/me/gift-inventory')).body.items[0];b.button('ownedGift',item.id).onclick();assert.equal(b.nodes['#gift-quantity'].disabled,true);assert.equal(b.nodes['#gift-send'].disabled,false);
});
test('purchase retries reuse their request after changing quantities and do not spend twice',async t=>{
 const {b,f,calls}=await setup(t);const api=b.c.api;let lost=2;
 b.c.api=async(path,method,...args)=>{const result=await api(path,method,...args);if(method==='POST'&&path.endsWith('/gifts')&&lost-->0)throw Error('응답 연결이 끊겼어요');return result;};
 await b.c.profileGiftDialog('friend','silver-letter');await b.submit();assert.match(b.form.error.textContent,/연결/);
 b.nodes['#gift-quantity'].value='5';b.nodes['#gift-quantity'].onchange();await b.submit();assert.match(b.form.error.textContent,/연결/);
 b.nodes['#gift-quantity'].value='1';b.nodes['#gift-quantity'].onchange();await b.submit();
 const sends=calls.filter(r=>r.method==='POST'&&r.path.endsWith('/gifts'));
 assert.equal(sends.length,3);assert.equal(sends[0].body.request_id,sends[2].body.request_id);assert.notEqual(sends[0].body.request_id,sends[1].body.request_id);
 assert.deepEqual(sends[0].body,sends[2].body);assert.equal((await f.call('/api/gold/balance')).body.silver_balance,88);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM free_gifts').get().n,2);assert.equal(b.renders,1);
});
test('recipient header passes the actual profile identity and image version to the shared avatar',async()=>{
 const seen=[],b=browser(async path=>path==='/api/gold'?{balance:37,free:{balance:9}}:path==='/api/me/gift-inventory'?{items:[]}:{profile:{id:'friend',user_id:'other',name:'실제 친구',display_name:'보이는 이름',image_version:'live-v2'}});
 b.c.avatarImage=(profile,kind,preview,equipment)=>{seen.push({profile,kind,preview,equipment});return '<img src="/actual-avatar">';};
 await b.c.profileGiftDialog('friend','silver-letter');
 assert.equal(seen[0].profile.id,'friend');assert.equal(seen[0].profile.name,'보이는 이름');assert.equal(seen[0].profile.image_version,'live-v2');
 assert.match(b.html,/\/actual-avatar/);assert.match(b.html,/id="gift-balance-g">37 G/);assert.match(b.html,/id="gift-balance-s">9 S/);
});
test('an explicit stored gift ID remains selected inside a grouped card and after changing recipient',async t=>{
 const {b,f,calls}=await setup(t),items=(await f.call('/api/me/gift-inventory')).body.items,id=items[1].id,opened=[];
 await b.c.profileGiftDialog('friend',{giftInventoryId:id});assert.match(b.html,new RegExp('data-owned-gift="'+id+'"'));assert.match(b.html,/보유 2개/);
 b.c.chooseGiftRecipient=selection=>opened.push(selection);await b.nodes['#gift-recipient'].onclick();assert.equal(opened[0].giftInventoryId,id);
 await b.submit();await b.submit();assert.equal(calls.find(value=>value.path.endsWith('/send')).path,'/api/me/gift-inventory/'+id+'/send');
});
test('a missing requested inventory item never silently selects another gift or a purchase',async t=>{
 const {b,calls}=await setup(t);await b.c.profileGiftDialog('friend',{giftInventoryId:'no-longer-owned'});
 assert.equal(b.nodes['#gift-send'].disabled,true);await b.submit();assert.equal(calls.filter(value=>value.method==='POST').length,0);
});
test('changing recipient keeps purchased decoration inventory and the selected ordinary quantity',async t=>{
 const {b}=await setup(t),opened=[];b.c.chooseGiftRecipient=selection=>opened.push(selection);
 await b.c.profileGiftDialog('friend',{id:'heart',quantity:5});assert.equal(b.nodes['#gift-quantity'].value,'5');await b.nodes['#gift-recipient'].onclick();assert.equal(opened[0].id,'heart');assert.equal(opened[0].quantity,5);
 b.form._giftUI.setDecoration({p:{sku:'frame_aurora_ring',name:'오로라 링',periodPrices:{P7D:50}},period:'P7D',periods:{P7D:'7일'},bought:'confirmed-stock',send(){},setPeriod(){}});
 await b.nodes['#gift-recipient'].onclick();assert.equal(opened[1].inventoryId,'confirmed-stock');assert.equal(opened[1].sku,undefined);
});
test('room gifts stay on the supplied gold transport and finish without rerendering the room',async t=>{
 const {b,calls}=await setup(t),sends=[],roomGift={recipients:[{id:'friend',name:'친구'}],async send(payload){sends.push(payload);return {gift:{type:payload.gift_type,quantity:payload.quantity},balance:300};}};
 await b.c.profileGiftDialog('friend',{id:'heart',quantity:2,roomGift});
 assert.ok(!calls.some(value=>value.path.includes('gift-inventory')));assert.ok(!b.html.includes('data-gift-type="silver-letter"'));
 for(const key of ['frames','themes','inventory'])assert.match(b.html,new RegExp('data-gift-category="'+key+'" aria-pressed="false" disabled'));
 assert.match(b.nodes['#gift-detail'].textContent,/토킹룸에서는 골드/);await b.submit();
 assert.equal(sends.length,1);assert.equal(sends[0].profile_id,'friend');assert.equal(sends[0].gift_type,'heart');assert.equal(sends[0].quantity,2);assert.match(sends[0].request_id,/^[a-f0-9-]{36}$/);
 assert.equal(calls.filter(value=>value.method==='POST').length,0);assert.equal(b.renders,0);assert.equal(b.nodes['#dialog'].open,false);
});
test('room failures reuse the same request and unavailable recipients never open a direct gift route',async t=>{
 const {b,calls}=await setup(t),sends=[],roomGift={recipients:[{id:'friend',name:'친구'}],async send(payload){sends.push(payload);if(sends.length===1)throw Error('방 연결을 다시 확인해주세요.');return {balance:350,gift:{type:'heart'}};}};
 await b.c.profileGiftDialog('friend',{id:'heart',roomGift});await b.submit();assert.match(b.form.error.textContent,/방 연결/);assert.equal(b.renders,0);await b.submit();assert.deepEqual(sends[0],sends[1]);
 const before=calls.length;await b.c.profileGiftDialog('outside-room',{id:'heart',roomGift});assert.equal(calls.length,before);assert.equal(b.renders,0);
});
test('inventory read failure is explicit and purchases stay usable; guests never fetch private inventory',async()=>{
 const wallet={balance:500,free:{balance:5}},profile={profile:{id:'friend',user_id:'other',name:'친구'}};
 const b=browser(async path=>{if(path.includes('gift-inventory'))throw Error('offline');return path==='/api/gold'?wallet:profile;});await b.c.profileGiftDialog('friend');
 assert.match(b.html,/보유 아이템을 불러오지 못했어요/);assert.match(b.html,/data-gift-inventory-retry/);assert.equal(b.nodes['#gift-send'].disabled,false);
 const paths=[];const guest=browser(async p=>{paths.push(p);return profile;},null);await guest.c.profileGiftDialog('friend');assert.ok(!paths.some(p=>p.includes('gift-inventory')));assert.match(guest.html,/로그인하면 보유한 선물/);
});
test('unavailable inventory is disabled and a changed account cannot send another account inventory',async t=>{
 const {b,f,calls}=await setup(t);f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('paid','owner','fixture-refund','refund_review',0,1,0)");await b.c.profileGiftDialog('friend');
 assert.match(b.html,/data-owned-gift="[^"]+" aria-pressed="false" disabled/);assert.match(b.html,/사용 불가/);
 f.sql.exec("DELETE FROM gold_orders WHERE id='paid'");await b.c.profileGiftDialog('friend');b.c.me={id:'other'};await b.submit();assert.match(b.form.error.textContent,/계정이 변경/);assert.equal(calls.filter(r=>r.method==='POST').length,0);
});
test('song entry makes the profile recipient explicit for stored gifts and preserves track purchases',async t=>{
 const {b,f,calls}=await setup(t);f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('friend-artist','friend','Guest artist',0);UPDATE tracks SET user_id='other',producer_id='friend',artist_id='friend-artist' WHERE id='one'");await b.c.giftDialog('one');assert.match(b.nodes['#gift-send-summary'].innerHTML,/프로필에 보내요/);await b.submit();await b.submit();assert.equal(calls.find(r=>r.path.endsWith('/send')).body.profile_id,'friend');
 await b.c.giftDialog('one','silver-letter');await b.submit();assert.ok(calls.some(r=>r.path==='/api/tracks/one/gifts'&&r.method==='POST'));
 const gifts=(await f.call('/api/notifications?filter=gifts','GET',null,'other')).body.items;
 assert.equal(gifts.length,2);
 for(const gift of gifts)assert.deepEqual([gift.source_type,gift.source_id,gift.href],['work','one','#song/one']);
});
test('rapid double submit keeps the send button disabled and issues one request',async t=>{
 const {b,calls}=await setup(t);const api=b.c.api;let release;const pending=new Promise(resolve=>release=resolve);
 b.c.api=async(path,...args)=>{if(path.endsWith('/send'))await pending;return api(path,...args);};
 await b.c.profileGiftDialog('friend');await b.submit();const first=b.submit();await b.submit();
 assert.equal(b.nodes['#gift-send'].disabled,true);release();await first;assert.equal(calls.filter(r=>r.path.endsWith('/send')).length,1);
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
