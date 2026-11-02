import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function context(){
 const listeners=[],calls=[],opened=[],forms={'#mp-inventory-recipient':{},'#mp-recipient-confirm':{},'#mp-confirm-send':{},'#mp-send-error':{},'#mp-gift-grant':{}};
 let html='',closed=false;
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,esc,number:String,me:{id:'owner'},authConfig:{admin:true},document:{addEventListener:(name,fn)=>{if(name==='click')listeners.push(fn);}},$:id=>id==='#dialog'?{close(){closed=true;}}:forms[id],mySection:(title,body)=>`<h2>${title}</h2>${body}`,busyForm:(form,submit)=>submit,dialog:value=>{html=value;},profileGiftDialog:(id,initial)=>opened.push({id,initial}),toast(){},render:async()=>{},api:async(path,method='GET',body)=>{calls.push({path,method,body});return path.includes('/recipient?')?{profile:{id:'recipient',name:'받는 <회원>',public_id:'QXF7082',public_number:17}}:{};}});
 vm.runInContext(source('inventory.js'),c);vm.runInContext(source('profile-management.js'),c);
 return {c,forms,listeners,calls,opened,get html(){return html;},get closed(){return closed;}};
}
test('stored gift public code lookup preserves the selected inventory ID when opening the common gift popup',async()=>{
 const h=context(),button={dataset:{inventorySend:'stock-1',giftName:'응원 선물'}};
 const event={preventDefault(){},target:{closest(selector){return selector.includes('[data-inventory-send]')?button:null;}}};
 await h.listeners[0](event);
 assert.match(h.html,/name="public_id"/);assert.match(h.html,/pattern="\[A-Za-z\]\{3\}\[0-9\]\{4\}"/);assert.match(h.html,/QXF7082/);assert.doesNotMatch(h.html,/inputmode="numeric"|숫자 ID/);
 await h.forms['#mp-inventory-recipient'].onsubmit(new Map([['public_id',' qxf7082 ']]));
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/me/gift-inventory/recipient?public_id=QXF7082');assert.equal(h.calls[0].method,'GET');
 assert.match(h.forms['#mp-recipient-confirm'].innerHTML,/ID: QXF7082/);assert.match(h.forms['#mp-recipient-confirm'].innerHTML,/받는 &lt;회원>/);assert.doesNotMatch(h.forms['#mp-recipient-confirm'].innerHTML,/ID: 17/);
 await h.forms['#mp-confirm-send'].onclick();
 assert.equal(h.calls.length,1);assert.equal(h.opened.length,1);assert.equal(h.opened[0].id,'recipient');assert.equal(h.opened[0].initial.giftInventoryId,'stock-1');assert.equal(h.closed,false);
});
test('admin stored gift grant sends the canonical public code without numeric coercion',async()=>{
 const h=context();
 const html=h.c.inventoryPurchaseHTML({gifts:[],silver_gifts:[]});assert.match(html,/name="public_id"/);assert.match(html,/maxlength="7"/);assert.doesNotMatch(html,/public_number|inputmode="numeric"/);
 h.c.bindProfileManagement({giftInventory:true});
 await h.forms['#mp-gift-grant'].onsubmit(new Map([['public_id',' qxf7082 '],['gift_type','silver-letter'],['quantity','2'],['reason','운영 테스트']]));
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/admin/gift-inventory/grant');assert.equal(h.calls[0].body.public_id,'QXF7082');assert.equal(h.calls[0].body.quantity,2);assert.equal('public_number' in h.calls[0].body,false);
});
