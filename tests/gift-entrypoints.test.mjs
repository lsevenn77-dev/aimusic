import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectGifts from '../shared/gifts.js';
import {DECORATIONS} from '../shared/decorations.js';

const decorations=readFileSync(new URL('../dist/decorations.js',import.meta.url),'utf8');
const gifts=readFileSync(new URL('../dist/gifts.js',import.meta.url),'utf8');
const extract=(name,end)=>decorations.slice(decorations.indexOf('async function '+name+'('),decorations.indexOf(end,decorations.indexOf('async function '+name+'(')));
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function control(attributes={}){
 return {attributes,dataset:Object.fromEntries(Object.entries(attributes).filter(([name])=>name.startsWith('data-')).map(([name,value])=>[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),value:attributes.value||'',disabled:false,isConnected:true,textContent:'',innerHTML:'',focus(){},setAttribute(){},removeAttribute(){}};
}
function shopBrowser(){
 const calls=[],opened=[],modal={open:true,classList:{remove(){}},addEventListener(){},removeEventListener(){},close(){this.open=false;}},close=control(),frame=DECORATIONS.frame_aurora_ring;
 const catalog={products:Object.values(DECORATIONS),periods:{P7D:'7일',P1M:'1개월',P3M:'3개월'},inventory:[{id:'stored-frame',item_key:frame.sku,period_code:'P1M',stored:true,available:true,product:frame}]};
 let form,html='';
 const context=nicknameContext({crypto,AifectGifts,giftDialogSerial:0,accountReady:Promise.resolve(),me:{id:'owner'},esc,number:String,frameEffects:{set(){}},DEFAULT_AVATAR:'/default-avatar',
  shopProductPeriods:(product,periods)=>Object.entries(periods).filter(([key])=>Number.isFinite(product.periodPrices[key])),decorationProductImage:product=>product.assetPaths.overlay||product.assetPaths.roomCard,
  $:selector=>selector==='#dialog'?modal:selector==='#dialog-close'?close:selector==='#shop-order'?form:selector==='.shop-checkout h2'?control():null,formError:()=>form.error,
  dialog(value){html=value;if(form)form.isConnected=false;if(!value.includes('id="shop-order"'))return;const elements=[];
   for(const match of value.matchAll(/<(button|input|textarea)\b([^>]*)>/g)){const attributes={};for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attributes[attr[1]]=attr[2];elements.push(control(attributes));}
   form={isConnected:true,error:control(),elements,querySelectorAll(selector){return selector==='[data-step]'?elements.filter(el=>'step'in el.dataset):selector==='[name=period]'?elements.filter(el=>el.attributes.name==='period'):selector==='[data-quantity]'?elements.filter(el=>'quantity'in el.dataset):[];},querySelector(selector){return selector==='[name=quantity]'?elements.find(el=>el.attributes.name==='quantity'):selector==='[type=submit]'?elements.find(el=>el.attributes.type==='submit'):selector==='.shop-money'||selector==='.frame-detail-layers>img'?control():null;}};
  },
  api:async(path,method='GET',body)=>{calls.push({path,method,body});return method==='POST'?{}:path==='/api/gifts/catalog'?{gifts:AifectGifts.GIFT_CATALOG,silver_gifts:AifectGifts.SILVER_GIFT_CATALOG}:path==='/api/decorations'?catalog:{balance:10000,silver_balance:100};},
  inventoryRecipientDialog:(item,state)=>opened.push({item,state}),askLogin(){},toast(){},refreshShopBalances(){},render(){},
 });
 vm.runInContext(decorations.slice(decorations.indexOf('function shopCoin('),decorations.indexOf('function shopIcon(')),context);
 vm.runInContext(extract('shopPurchaseDialog',"\ndocument.addEventListener('click',e=>{"),context);
 context.shopGiftDialog=(product,period,quantity,wallet)=>opened.push({id:product.id,sku:product.sku,period,quantity,wallet});
 vm.runInContext(extract('storedDecorationDialog',"\ndocument.addEventListener('click',e=>{"),context);
 return {context,calls,opened,get form(){return form;},get html(){return html;}};
}
test('shop gift entry preserves the selected ordinary quantity and leaves purchase in the existing inventory flow',async()=>{
 const b=shopBrowser();await b.context.shopPurchaseDialog({id:'heart'});const quantity=b.form.querySelector('[name=quantity]');quantity.value='7';quantity.oninput();
 await b.form.querySelectorAll('[data-step]').find(button=>button.dataset.step==='recipient').onclick();
 assert.equal(b.opened[0].id,'heart');assert.equal(b.opened[0].quantity,7);assert.equal(b.calls.filter(call=>call.method==='POST').length,0);
 const purchase=shopBrowser();await purchase.context.shopPurchaseDialog({id:'heart'});await purchase.form.onsubmit({preventDefault(){}});
 const write=purchase.calls.find(call=>call.method==='POST');assert.equal(write.path,'/api/me/gift-inventory/buy');assert.equal(write.body.gift_type,'heart');assert.equal(write.body.quantity,1);assert.equal(write.body.profile_id,undefined);
});
test('shop decoration gift entry preserves the period while purchase still buys into inventory',async()=>{
 const b=shopBrowser();await b.context.shopPurchaseDialog({sku:'frame_aurora_ring'});b.form.querySelectorAll('[name=period]').find(input=>input.value==='P1M').onchange();
 await b.form.querySelectorAll('[data-step]').find(button=>button.dataset.step==='recipient').onclick();assert.equal(b.opened[0].sku,'frame_aurora_ring');assert.equal(b.opened[0].period,'P1M');assert.equal(b.calls.filter(call=>call.method==='POST').length,0);
 const purchase=shopBrowser();await purchase.context.shopPurchaseDialog({sku:'frame_aurora_ring',period:'P3M'});await purchase.form.onsubmit({preventDefault(){}});
 const write=purchase.calls.find(call=>call.method==='POST');assert.equal(write.path,'/api/decorations/buy');assert.equal(write.body.period,'P3M');assert.equal(write.body.profile_id,undefined);
});
test('stored decoration gift entry validates current stock and passes its actual unit to the inventory popup',async()=>{
 const b=shopBrowser();await b.context.storedDecorationDialog('stored-frame','send');assert.equal(b.opened.length,1);assert.equal(b.opened[0].item.ids[0],'stored-frame');assert.equal(b.opened[0].state.account,'owner');assert.equal(b.calls.filter(call=>call.method==='POST').length,0);
 await b.context.storedDecorationDialog('missing-stock','send');assert.equal(b.opened.length,1);assert.equal(b.calls.filter(call=>call.method==='POST').length,0);
});
test('room recipient chooser filters only supplied members and keeps the room transport and quantity',async()=>{
 const opened=[],changed=[],calls=[],form={isConnected:true,elements:{q:{value:''}},error:{textContent:''}},modal={open:true,close(){}},list={buttons:[],querySelectorAll(){return this.buttons;}};
 Object.defineProperty(list,'innerHTML',{set(html){this.html=html;this.buttons=[...html.matchAll(/data-gift-recipient="([^"]+)"/g)].map(match=>({dataset:{giftRecipient:match[1]}}));},get(){return this.html;}});
 const roomGift={recipients:[{id:'friend',name:'친구'},{id:'member-two',name:'다른 참여자'}],send:async()=>({}),onRecipientChange:id=>changed.push(id)},selection={id:'heart',quantity:5,roomGift};
 const context=nicknameContext({crypto,AifectGifts,esc,me:{id:'owner',profile_id:'self'},accountReady:Promise.resolve(),icon:()=>'',dialog(){},$:selector=>selector==='#dialog'?modal:selector==='#gift-recipient-search'?form:list,formError:()=>form.error,
  busyForm:(_form,work)=>async event=>{event.preventDefault();await work();},api:async(...args)=>{calls.push(args);throw Error('room chooser must not search all members');},askLogin(){},});
 vm.runInContext(gifts,context);context.profileGiftDialog=(id,initial)=>opened.push({id,initial});await context.chooseGiftRecipient(selection);assert.equal(list.buttons.length,2);
 form.elements.q.value='없는 회원';await form.onsubmit({preventDefault(){}});assert.equal(list.buttons.length,0);
 form.elements.q.value='친구';await form.onsubmit({preventDefault(){}});assert.equal(list.buttons.length,1);await list.buttons[0].onclick();
 assert.equal(calls.length,0);assert.deepEqual(changed,['friend']);assert.equal(opened[0].id,'friend');assert.equal(opened[0].initial.quantity,5);assert.equal(opened[0].initial.roomGift,roomGift);
});
