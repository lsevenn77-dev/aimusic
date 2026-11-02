import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {decorationsFixture} from './decorations-fixture.mjs';

const source=readFileSync(new URL('../dist/decorations.js',import.meta.url),'utf8');
const adapter=source.slice(source.indexOf('async function bindGiftCategoryTabs('),source.indexOf('function decorationProductImage('));
function element(dataset={}){
 const el={dataset,children:[],buttons:[],hidden:false,disabled:false,isConnected:true,textContent:'',attributes:{},listeners:{},className:'',classList:{toggle(){}},
  setAttribute(key,value){this.attributes[key]=String(value);},
  append(child){if(child.parent)child.parent.children=child.parent.children.filter(value=>value!==child);child.parent=this;this.children.push(child);},
  addEventListener(type,listener){this.listeners[type]=listener;},
  querySelectorAll(selector){return selector==='[data-gift-decoration-index]'?this.buttons:[];},
 };
 Object.defineProperty(el,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;this.buttons=[];for(const match of html.matchAll(/<button\b([^>]*)>/g)){const dataset={};for(const value of match[1].matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[value[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value[2];this.buttons.push(element(dataset));}}});
 return el;
}
function browser(api){
 const owned=element(),ordinary=element(),list=element(),tabs=['gifts','frames','themes','inventory'].map(giftCategory=>element({giftCategory})),section=element(),form=element(),error=element(),created=[];
 owned.className='gift-owned';list.append(owned);list.append(ordinary);list.querySelector=selector=>selector==='.gift-owned'?owned:null;
 section.querySelectorAll=()=>tabs;form.closest=()=>section;form.querySelector=selector=>selector==='.gift-options'?list:selector==='.form-error'?error:null;form.querySelectorAll=()=>[];
 const ui={category:null,decoration:null,wallet:null,setCategory(key){this.category=key;this.decoration=null;},setDecoration(value){this.decoration=value;},selectOrdinary(){this.decoration=null;},async refreshWallet(){this.wallet=await api('/api/gold','GET',undefined,{fresh:true});}};form._giftUI=ui;
 const modal={open:true,close(){this.open=false;}},context=vm.createContext({crypto,giftDialogSerial:1,me:{id:'owner'},document:{createElement(){const value=element();created.push(value);return value;}},api,
  esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),number:String,formError:()=>error,$:()=>modal,toast(){},askLogin(){},});
 vm.runInContext(adapter,context);
 return {context,form,ui,list,created,error,modal,open:initial=>context.bindGiftCategoryTabs(form,{recipientId:'friend',initial,serial:1,account:'owner',initialOwned:false}),tab:key=>tabs.find(value=>value.dataset.giftCategory===key).onclick(),get products(){return created.find(value=>value.className==='gift-decoration-products');}};
}
function backend(f,{loseSend=false,loseBuy=false,waitSend}={}){
 const calls=[];let sendLost=loseSend,buyLost=loseBuy;
 const api=async(path,method='GET',body,options)=>{calls.push({path,method,body,options});if(path.endsWith('/send')&&waitSend)await waitSend;
  const result=await f.call(path,method,body);if(result.status>=400)throw Error(result.body.error);
  if(path==='/api/decorations/buy'&&buyLost){buyLost=false;throw Error('구매 응답 연결이 끊겼어요');}
  if(path.endsWith('/send')&&sendLost){sendLost=false;throw Error('전송 응답 연결이 끊겼어요');}
  return result.body;
 };
 return {api,calls};
}
test('decoration selection uses the common footer and preserves server period and legacy buy/send endpoints',async t=>{
 const f=await decorationsFixture(t),{api,calls}=backend(f),b=browser(api);await b.open({sku:'frame_aurora_ring',period:'P1M'});
 assert.equal(b.ui.category,'frames');assert.equal(b.ui.decoration.p.sku,'frame_aurora_ring');assert.equal(b.ui.decoration.period,'P1M');
 assert.deepEqual(b.created.map(value=>value.className),['gift-ordinary-products','gift-decoration-products']);
 await b.ui.decoration.send();
 const writes=calls.filter(value=>value.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].path,'/api/decorations/buy');assert.equal(writes[0].body.period,'P1M');
 assert.deepEqual(Object.keys(writes[0].body).sort(),['period','request_id','sku']);assert.deepEqual(Object.keys(writes[1].body).sort(),['profile_id','request_id']);assert.equal(writes[1].body.profile_id,'friend');
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,150);assert.equal(b.ui.wallet.balance,9850);
 const item=f.sql.prepare('SELECT user_id,expires_at FROM player_inventory').get();assert.equal(item.user_id,'other');assert.equal((await f.call('/api/decorations','GET',undefined,'other')).body.inventory[0].period_code,'P1M');assert.equal(item.expires_at,0);assert.equal(b.modal.open,false);
});
test('lost transfer response survives another tab and retries the same inventory without another purchase',async t=>{
 const f=await decorationsFixture(t),{api,calls}=backend(f,{loseSend:true}),b=browser(api);await b.open({sku:'frame_aurora_ring'});
 await b.ui.decoration.send();assert.match(b.error.textContent,/연결/);const purchased=b.ui.decoration.bought;assert.ok(purchased);
 await b.tab('themes');await b.tab('frames');assert.equal(b.ui.decoration.bought,purchased);await b.ui.decoration.send();
 const buys=calls.filter(value=>value.method==='POST'&&value.path==='/api/decorations/buy'),sends=calls.filter(value=>value.path.endsWith('/send'));
 assert.equal(buys.length,1);assert.equal(sends.length,2);assert.equal(sends[0].path,sends[1].path);assert.deepEqual(sends[0].body,sends[1].body);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM decoration_transfers').get().n,1);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,50);
});
test('uncertain purchase keeps its request when the selected period changes and returns',async t=>{
 const f=await decorationsFixture(t),{api,calls}=backend(f,{loseBuy:true}),b=browser(api);await b.open({sku:'frame_aurora_ring'});
 await b.ui.decoration.send();assert.match(b.error.textContent,/연결/);assert.equal(b.ui.decoration.bought,null);
 b.ui.decoration.setPeriod('P1M');b.ui.decoration.setPeriod('P7D');await b.ui.decoration.send();
 const buys=calls.filter(value=>value.method==='POST'&&value.path==='/api/decorations/buy');assert.equal(buys.length,2);assert.deepEqual(buys[0].body,buys[1].body);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM decoration_orders').get().n,1);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,50);
});
test('stored variants keep distinct inventory IDs and immutable periods with no additional purchase',async t=>{
 const f=await decorationsFixture(t);await f.buy('frame_aurora_ring','P7D');const month=await f.buy('frame_aurora_ring','P1M'),id=month.body.order.inventory_id;
 const {api,calls}=backend(f),b=browser(api);await b.open({inventoryId:id});
 assert.equal(b.ui.category,'inventory');assert.match(b.products.innerHTML,/7일/);assert.match(b.products.innerHTML,/1개월/);assert.equal(b.ui.decoration.item.id,id);assert.equal(b.ui.decoration.period,'P1M');
 b.ui.decoration.setPeriod('P7D');assert.equal(b.ui.decoration.period,'P1M');await b.ui.decoration.send();
 const writes=calls.filter(value=>value.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/decorations/inventory/'+id+'/send');
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,200);assert.equal((await f.call('/api/decorations','GET',undefined,'other')).body.inventory.find(item=>item.id===id).period_code,'P1M');
});
test('pending decoration transfer blocks duplicate submits and category changes',async t=>{
 const f=await decorationsFixture(t);let release;const pending=new Promise(resolve=>release=resolve),{api,calls}=backend(f,{waitSend:pending}),b=browser(api);
 await b.open({sku:'frame_aurora_ring'});const first=b.ui.decoration.send();assert.equal(b.form._busy,true);await b.ui.decoration.send();await b.tab('themes');assert.equal(b.ui.category,'frames');
 release();await first;assert.equal(calls.filter(value=>value.method==='POST'&&value.path==='/api/decorations/buy').length,1);assert.equal(calls.filter(value=>value.path.endsWith('/send')).length,1);assert.equal(b.form._busy,false);
});
